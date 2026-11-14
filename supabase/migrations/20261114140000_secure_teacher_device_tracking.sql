-- P0: secure Teacher Device Tracking reads behind the teacher token.
-- All active teachers may inspect department-wide tracking, as approved by the department.
-- Return only attendance metadata required by the existing tracking UI; never return GPS coordinates.

create or replace function public.t_teacher_tracking_students(
  p_token text,
  p_query text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_query text;
  v_students jsonb;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);
  if v_teacher_id is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired. Please log in again.');
  end if;

  v_query := nullif(btrim(p_query), '');
  if v_query is null or length(v_query) > 40 then
    return jsonb_build_object('ok', false, 'message', 'Enter a valid roll or registration number.');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.session_year desc, x.year, x.class_roll), '[]'::jsonb)
  into v_students
  from (
    select st.id, st.name, st.class_roll, st.reg_no, st.session, st.session_year, st.year
    from public.students st
    where st.class_roll ilike '%' || replace(replace(replace(v_query, '%', '\\%'), '_', '\\_'), '\\', '\\\\') || '%'
       or st.reg_no ilike '%' || replace(replace(replace(v_query, '%', '\\%'), '_', '\\_'), '\\', '\\\\') || '%'
    order by st.session_year desc, st.year, st.class_roll
    limit 50
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end
$function$;

create or replace function public.t_teacher_tracking_records(
  p_token text,
  p_device_prefix text default null,
  p_student_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_prefix text;
  v_count integer;
  v_records jsonb;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);
  if v_teacher_id is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired. Please log in again.');
  end if;

  v_prefix := nullif(btrim(p_device_prefix), '');
  if ((v_prefix is null) = (p_student_id is null)) then
    return jsonb_build_object('ok', false, 'message', 'Search by either Device ID or student, not both.');
  end if;
  if v_prefix is not null and length(v_prefix) > 128 then
    return jsonb_build_object('ok', false, 'message', 'Invalid Device ID search.');
  end if;
  if (p_from is null) <> (p_to is null) then
    return jsonb_build_object('ok', false, 'message', 'Select both date limits or leave both blank.');
  end if;
  if p_from is not null and (p_to < p_from or p_to - p_from > 365) then
    return jsonb_build_object('ok', false, 'message', 'Date range must be valid and no longer than 366 days.');
  end if;

  select count(*)::integer into v_count
  from public.attendance_records r
  where (p_student_id is null or r.student_id = p_student_id)
    and (v_prefix is null or r.device_id ilike v_prefix || '%')
    and (p_from is null or (r.marked_at >= p_from::timestamp at time zone 'Asia/Dhaka'
      and r.marked_at < (p_to + 1)::timestamp at time zone 'Asia/Dhaka'));

  select coalesce(jsonb_agg(x.row_data order by x.marked_at desc nulls last), '[]'::jsonb)
  into v_records
  from (
    select r.marked_at,
      jsonb_build_object(
        'id', r.id,
        'marked_at', r.marked_at,
        'device_id', r.device_id,
        'status', r.status,
        'student_id', r.student_id,
        'students', jsonb_build_object(
          'name', st.name,
          'class_roll', st.class_roll,
          'reg_no', st.reg_no
        ),
        'attendance_sessions', jsonb_build_object(
          'course_code', s.course_code,
          'date', s.date
        )
      ) as row_data
    from public.attendance_records r
    left join public.students st on st.id = r.student_id
    left join public.attendance_sessions s on s.id = r.session_id
    where (p_student_id is null or r.student_id = p_student_id)
      and (v_prefix is null or r.device_id ilike v_prefix || '%')
      and (p_from is null or (r.marked_at >= p_from::timestamp at time zone 'Asia/Dhaka'
        and r.marked_at < (p_to + 1)::timestamp at time zone 'Asia/Dhaka'))
    order by r.marked_at desc nulls last
    limit 500
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'truncated', v_count > 500,
    'records', v_records
  );
end
$function$;

revoke all on function public.t_teacher_tracking_students(text, text) from public;
grant execute on function public.t_teacher_tracking_students(text, text) to anon, authenticated;
revoke all on function public.t_teacher_tracking_records(text, text, uuid, date, date) from public;
grant execute on function public.t_teacher_tracking_records(text, text, uuid, date, date) to anon, authenticated;
