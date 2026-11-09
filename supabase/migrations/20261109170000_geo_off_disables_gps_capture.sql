-- Geo OFF must disable both client-side capture and server-side coordinate persistence.
-- Preserve historical attendance and GPS rows. Existing settings remain ON, but default radius is set to 100m in Allow mode.
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
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
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

    if g.mode = 'block' and v_status <> 'inside' then
      return jsonb_build_object('ok', false, 'geo_status', v_status, 'geo_distance_m', v_dist,
        'message', case v_status
          when 'no_location' then 'Location is required to mark attendance. Please allow location access and try again.'
          when 'poor_accuracy' then 'GPS signal is weak. Move near a window or outdoors and try again.'
          else 'You appear to be about ' || v_dist || ' m away from the college. Attendance not recorded.' end);
    end if;
  end if;

  insert into attendance_records (session_id, student_id, status, marked_at, device_id, geo_distance_m, geo_accuracy_m, geo_status)
  values (v_session.id, v_student.id, 'present', now(), p_device_id, v_dist, v_acc, v_status)
  returning id into v_record_id;

  -- Crucial: do not persist coordinates when Geo is OFF (or settings are absent).
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

-- Set the requested initial operating choice: 100m radius, Allow outside radius.
-- Keep the existing enabled state and college coordinates unchanged.
update public.geo_settings
   set radius_m = 100, mode = 'log', updated_at = now()
 where id = 1;
