-- Restore the exact SQL recorded for migration 20261117181100_gps_require_log_mode.
-- This migration is already applied in the production database. Keep this file in Git
-- so fresh environments and Supabase branch replays can reproduce the same schema.

ALTER TABLE public.geo_settings DROP CONSTRAINT IF EXISTS geo_settings_mode_check;
ALTER TABLE public.geo_settings
  ADD CONSTRAINT geo_settings_mode_check CHECK (mode = ANY (ARRAY['log'::text, 'require_log'::text, 'block'::text]));

CREATE OR REPLACE FUNCTION public.admin_set_geo_settings(p_enabled boolean, p_mode text, p_lat double precision, p_lng double precision, p_radius integer, p_max_acc integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then return jsonb_build_object('ok', false, 'message', 'শুধু অ্যাডমিন পারেন'); end if;
  if p_mode is null or p_mode not in ('log', 'require_log', 'block') then return jsonb_build_object('ok', false, 'message', 'Mode must be log, require_log or block'); end if;
  if p_radius is null or p_radius < 20 or p_radius > 5000 then return jsonb_build_object('ok', false, 'message', 'Radius must be 20-5000 m'); end if;
  if p_max_acc is null or p_max_acc < 20 or p_max_acc > 1000 then return jsonb_build_object('ok', false, 'message', 'Max GPS error must be 20-1000 m'); end if;
  if p_enabled and (p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    return jsonb_build_object('ok', false, 'message', 'Set a valid college location first');
  end if;
  update geo_settings set enabled = p_enabled, mode = p_mode,
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         radius_m = p_radius, max_accuracy_m = p_max_acc, updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true);
end
$function$;

CREATE OR REPLACE FUNCTION public.student_mark_attendance_v4(
  p_pin text,
  p_student_id uuid,
  p_device_id text,
  p_lat double precision DEFAULT NULL::double precision,
  p_lng double precision DEFAULT NULL::double precision,
  p_accuracy double precision DEFAULT NULL::double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_session attendance_sessions%rowtype;
  v_student students%rowtype;
  v_key text;
  v_mins int;
  g geo_settings%rowtype;
  v_status text := null;
  v_dist int := null;
  v_acc int := null;
  d double precision;
  v_record_id uuid;
  v_geo_enabled boolean := false;
begin
  v_key := case when coalesce(p_device_id, '') = '' then null else 'dev:' || left(p_device_id, 100) end;
  if v_key is not null then
    v_mins := _lock_remaining(v_key);
    if v_mins > 0 then
      return jsonb_build_object('ok', false, 'message', 'Too many wrong PIN attempts from this device. Try again in ' || v_mins || ' minute(s).');
    end if;
  end if;

  select * into v_session from attendance_sessions
   where pin = p_pin and is_active = true and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    if v_key is not null then perform _register_failure(v_key, 10, interval '10 minutes', interval '10 minutes'); end if;
    return jsonb_build_object('ok', false, 'message', 'Invalid or expired PIN');
  end if;

  select * into v_student from students
   where id = p_student_id and year = v_session.year and session_year = v_session.session_year and status = 'active';
  if not found then return jsonb_build_object('ok', false, 'message', 'Student not found in this class/session_year'); end if;

  select * into g from geo_settings where id = 1;
  v_geo_enabled := found and coalesce(g.enabled, false);

  -- Only calculate GPS metadata when Geo is ON and a college location is configured.
  if v_geo_enabled and g.lat is not null and g.lng is not null then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
       or (g.mode = 'require_log' and p_accuracy is null) then
      v_status := 'no_location';
    else
      d := 2 * 6371000 * asin(least(1, sqrt(power(sin(radians(p_lat - g.lat) / 2), 2)
             + cos(radians(g.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - g.lng) / 2), 2))));
      v_dist := round(d)::int;
      v_acc := case when p_accuracy is null then null else round(p_accuracy)::int end;
      if v_acc is not null and v_acc > g.max_accuracy_m then v_status := 'poor_accuracy';
      elsif v_dist <= g.radius_m then v_status := 'inside';
      else v_status := 'outside'; end if;
    end if;

    -- block: reject attendance outside the radius or without a usable location.
    if g.mode = 'block' and v_status <> 'inside' then
      return jsonb_build_object('ok', false, 'geo_status', v_status, 'geo_distance_m', v_dist,
        'message', case v_status
          when 'no_location' then 'Location is required to mark attendance. Please allow location access and try again.'
          when 'poor_accuracy' then 'GPS signal is weak. Move near a window or outdoors and try again.'
          else 'You appear to be about ' || v_dist || ' m away from the college. Attendance not recorded.' end);
    end if;

    -- require_log: require location and acceptable accuracy; radius does not block attendance.
    if g.mode = 'require_log' and v_status in ('no_location', 'poor_accuracy') then
      return jsonb_build_object('ok', false, 'geo_status', v_status, 'geo_distance_m', v_dist,
        'message', case v_status
          when 'no_location' then 'Location is required to mark attendance. Please allow location access and try again.'
          else 'GPS signal is weak. Move near a window or outdoors and try again.' end);
    end if;
  end if;

  insert into attendance_records (session_id, student_id, status, marked_at, device_id, geo_distance_m, geo_accuracy_m, geo_status)
  values (v_session.id, v_student.id, 'present', now(), p_device_id, v_dist, v_acc, v_status)
  returning id into v_record_id;

  -- Never persist coordinates when Geo is OFF or settings are absent.
  if v_geo_enabled
     and p_lat is not null and p_lng is not null
     and p_lat between -90 and 90 and p_lng between -180 and 180 then
    insert into geo_attendance_locations(attendance_record_id, latitude, longitude, accuracy_m, captured_at)
    values (v_record_id, p_lat, p_lng,
            case when p_accuracy is null then null else greatest(0, round(p_accuracy)::int) end, now());
  end if;

  return jsonb_build_object('ok', true, 'student_name', v_student.name, 'geo_status', v_status, 'geo_distance_m', v_dist);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'message', 'Attendance already marked');
end
$function$;
