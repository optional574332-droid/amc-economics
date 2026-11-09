
create table if not exists public.geo_attendance_locations (
 attendance_record_id uuid primary key references public.attendance_records(id) on delete cascade,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 accuracy_m integer,
 captured_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.geo_attendance_locations enable row level security;
revoke all on public.geo_attendance_locations from anon, authenticated, public;
comment on table public.geo_attendance_locations is 'Private GPS coordinates; access only through gps_attendance_report security-definer RPC.';
CREATE OR REPLACE FUNCTION public.student_mark_attendance_v4(p_pin text, p_student_id uuid, p_device_id text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
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
  if found and g.enabled and g.lat is not null and g.lng is not null then
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

  -- Coordinates are kept in a separate RLS-protected table, never in public attendance_records.
  if p_lat is not null and p_lng is not null
     and p_lat between -90 and 90 and p_lng between -180 and 180 then
    insert into geo_attendance_locations(attendance_record_id, latitude, longitude, accuracy_m, captured_at)
    values (v_record_id, p_lat, p_lng,
            case when p_accuracy is null then null else greatest(0, round(p_accuracy)::int) end, now());
  end if;

  return jsonb_build_object('ok', true, 'student_name', v_student.name, 'geo_status', v_status, 'geo_distance_m', v_dist);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'message', 'Attendance already marked');
end
$function$


create or replace function public.gps_attendance_report(
 p_token text default null, p_from date default current_date, p_to date default current_date,
 p_year text default null, p_session_year integer default null, p_course_code text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'extensions'
as $function$
declare v_teacher_id uuid := null; v_admin boolean := false; v_rows jsonb;
begin
 if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 31 then
  return jsonb_build_object('ok', false, 'message', 'Select a valid date range (maximum 31 days).');
 end if;
 v_admin := public.is_admin();
 if not v_admin then
  v_teacher_id := public._teacher_id_from_token(p_token);
  if v_teacher_id is null then return jsonb_build_object('ok', false, 'message', 'Login expired. Please login again.'); end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'record_id', ar.id, 'session_id', s.id, 'date', s.date, 'marked_at', ar.marked_at,
  'course_code', s.course_code, 'year', s.year, 'session_year', s.session_year,
  'roll', st.class_roll, 'reg_no', st.reg_no, 'student_name', st.name, 'status', ar.status,
  'geo_status', ar.geo_status, 'distance_m', ar.geo_distance_m,
  'accuracy_m', coalesce(gal.accuracy_m, ar.geo_accuracy_m),
  'latitude', gal.latitude, 'longitude', gal.longitude,
  'has_coordinates', (gal.latitude is not null and gal.longitude is not null)
 ) order by s.date desc, ar.marked_at desc), '[]'::jsonb)
 into v_rows
 from public.attendance_records ar
 join public.attendance_sessions s on s.id = ar.session_id
 join public.students st on st.id = ar.student_id
 left join public.geo_attendance_locations gal on gal.attendance_record_id = ar.id
 where s.date between p_from and p_to
  and (p_year is null or s.year = p_year)
  and (p_session_year is null or s.session_year = p_session_year)
  and (p_course_code is null or s.course_code = p_course_code)
  and (v_admin or s.teacher_id = v_teacher_id or public.teacher_owns_course(v_teacher_id, s.session, s.year, s.course_code));
 return jsonb_build_object('ok', true, 'rows', v_rows);
end
$function$;
revoke all on function public.gps_attendance_report(text,date,date,text,integer,text) from public;
grant execute on function public.gps_attendance_report(text,date,date,text,integer,text) to anon, authenticated;
