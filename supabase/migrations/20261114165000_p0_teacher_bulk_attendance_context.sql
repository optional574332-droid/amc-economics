-- P0 PHASE 1 (additive). New function only; nothing existing is changed.
-- Replaces the Teacher Bulk Attendance screen's direct reads of students and
-- attendance_records with one token-validated, course-scoped RPC, so those tables can
-- later be closed to anonymous callers without breaking Bulk Attendance.
-- Same authorization rule as t_get_or_create_bulk_session: the course must be assigned
-- to the teacher.

create or replace function public.t_bulk_attendance_context(
  p_token text,
  p_year text,
  p_course_code text,
  p_session_year integer,
  p_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_count integer;
  v_students jsonb;
  v_records jsonb;
  v_session_id uuid;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);
  if v_teacher_id is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired. Please log in again.');
  end if;

  if p_year is null or p_year = ''
     or p_course_code is null or p_course_code = ''
     or p_session_year is null or p_date is null then
    return jsonb_build_object('ok', false, 'message', 'Class, course, date and session year are required.');
  end if;

  if not public.teacher_owns_course(v_teacher_id, 'ALL', p_year, p_course_code) then
    return jsonb_build_object('ok', false, 'message', 'This course is not assigned to you.');
  end if;

  select count(*)::integer into v_count
  from public.students st
  where st.year = p_year
    and st.session_year = p_session_year
    and st.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'name', x.name, 'class_roll', x.class_roll, 'reg_no', x.reg_no,
           'session', x.session, 'is_irregular', x.is_irregular,
           'year', x.year, 'session_year', x.session_year
         ) order by x.class_roll), '[]'::jsonb)
    into v_students
  from (
    select st.id, st.name, st.class_roll, st.reg_no, st.session, st.is_irregular, st.year, st.session_year
    from public.students st
    where st.year = p_year
      and st.session_year = p_session_year
      and st.status = 'active'
    order by st.class_roll
    limit 2000
  ) x;

  -- Existing records of every session for this exact class/course/date, so PIN,
  -- Manual and Bulk rows are all shown as locked (same as the previous direct read).
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', r.student_id,
           'attendance_source', r.attendance_source,
           'marked_by', r.marked_by,
           'status', r.status
         )), '[]'::jsonb)
    into v_records
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  where s.year = p_year
    and s.course_code = p_course_code
    and s.date = p_date
    and s.session_year = p_session_year;

  select s.id into v_session_id
  from public.attendance_sessions s
  where s.year = p_year
    and s.course_code = p_course_code
    and s.date = p_date
    and s.session_year = p_session_year
  order by s.created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'truncated', v_count > 2000,
    'students', v_students,
    'records', v_records,
    'session_id', v_session_id
  );
end
$function$;

revoke all on function public.t_bulk_attendance_context(text, text, text, integer, date) from public;
grant execute on function public.t_bulk_attendance_context(text, text, text, integer, date) to anon, authenticated;
