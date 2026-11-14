-- P0 PHASE 3 (LOCKDOWN). Apply ONLY AFTER:
--   (1) the Phase 1 migrations are applied, and
--   (2) the updated frontend (js/bulk-attendance.js, js/teacher.js, js/attendance.js, js/utils.js,
--       js/student.js, js/auth.js, js/directory.js, sw.js v16) is deployed to Production and tested
--       for Student, Teacher (PIN, Manual, Bulk, Marks, Live, Reports) and Admin.
-- This file closes direct anonymous reads of students / attendance_records and replaces three
-- existing functions. No row is inserted, updated or deleted.
-- Rollback script: supabase/rollback/phase3_rollback.sql

-- Student rows are readable directly only by authenticated Admin users.
drop policy if exists students_read on public.students;
drop policy if exists students_admin_read on public.students;
create policy students_admin_read
  on public.students
  for select
  to authenticated
  using (public.is_admin());

-- Keep the existing students_admin_write policy for Admin CRUD.
-- Remove direct table privileges from unauthenticated callers; token/PIN
-- workflows use the narrowly scoped SECURITY DEFINER RPCs below.
revoke all privileges on table public.students from public, anon;

-- Attendance records are directly readable only by Admins. Teacher and
-- Student dashboards already use token-validated RPCs.
drop policy if exists att_read on public.attendance_records;
drop policy if exists att_admin_read on public.attendance_records;
create policy att_admin_read
  on public.attendance_records
  for select
  to authenticated
  using (public.is_admin());

revoke all privileges on table public.attendance_records from public, anon;

-- Admin-only mutation RPCs must not be callable by the anonymous API role.
revoke all on function public.admin_promote_students(text, integer, uuid[], boolean) from public, anon;
grant execute on function public.admin_promote_students(text, integer, uuid[], boolean) to authenticated;

revoke all on function public.bulk_update_students(integer, text, jsonb) from public, anon;
grant execute on function public.bulk_update_students(integer, text, jsonb) to authenticated;

-- Held-session metadata is consumed by the Admin Attendance and Admin Individual Reports.
-- Student Dashboard uses its separate token-validated RPC flow. Keep this helper Admin-only.
create or replace function public.get_held_sessions(
  p_year text,
  p_session_year integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_sessions jsonb;
begin
  if not public.is_admin() then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'course_code', s.course_code,
        'date', s.date
      ) order by s.date, s.course_code
    ),
    '[]'::jsonb
  )
  into v_sessions
  from public.attendance_sessions s
  where s.year = p_year
    and s.session_year = p_session_year
    and exists (
      select 1
      from public.attendance_records r
      where r.session_id = s.id
        and r.status in ('present', 'late')
    );

  return v_sessions;
end
$function$;

revoke all on function public.get_held_sessions(text, integer) from public, anon;
grant execute on function public.get_held_sessions(text, integer) to authenticated;

-- Teacher Routine still calls this RPC to expand today's class roster. Keep the
-- API entry point, but enforce the same ownership/course-assignment rule as the
-- newer Live Attendance RPC before returning student attendance details.
create or replace function public.t_session_students(p_token text, p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tid uuid := public._teacher_id_from_token(p_token);
  v_date date := (now() at time zone 'Asia/Dhaka')::date;
  v_s public.attendance_sessions%rowtype;
  v_recs jsonb;
begin
  if v_tid is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired, please login again');
  end if;
  select * into v_s from public.attendance_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Session not found');
  end if;
  if v_s.date <> v_date then
    return jsonb_build_object('ok', false, 'message', 'Only today''s classes can be viewed here');
  end if;
  -- Preserve the current department-wide read behavior for authenticated teachers:
  -- any active teacher may view today's session roster from Today Summary.
  -- This RPC is read-only; write RPCs retain their separate course-ownership checks.
  select coalesce(jsonb_agg(jsonb_build_object(
           'status', r.status, 'marked_at', r.marked_at,
           'class_roll', st.class_roll, 'reg_no', st.reg_no, 'name', st.name,
           'is_irregular', st.is_irregular,
           'geo_status', r.geo_status, 'geo_distance_m', r.geo_distance_m
         ) order by st.class_roll), '[]'::jsonb)
    into v_recs
  from public.attendance_records r
  join public.students st on st.id = r.student_id
  where r.session_id = p_session_id;
  return jsonb_build_object('ok', true, 'records', v_recs);
end
$function$;
revoke all on function public.t_session_students(text, uuid) from public;
grant execute on function public.t_session_students(text, uuid) to anon, authenticated;

-- Legacy session-creation helper trusts a caller-supplied teacher UUID and
-- does not require a teacher login token. Current frontend uses t_create_session.
-- Disable this obsolete API entry point.
revoke all on function public.teacher_create_session(uuid, text, text, text, date) from public, anon, authenticated;

-- Course-ownership helper is an internal authorization primitive, not a client API.
-- SECURITY DEFINER RPCs owned by the function owner can continue calling it.
revoke all on function public.teacher_owns_course(uuid, text, text, text) from public, anon, authenticated;

-- Least-privilege: authenticated users need SELECT/INSERT/UPDATE/DELETE only
-- as governed by RLS. These table-level privileges are not required by the app.
revoke truncate, references, trigger on table public.students from authenticated;
revoke truncate, references, trigger on table public.attendance_records from authenticated;
-- P0: keep the public Faculty Directory useful without exposing private contact details.
-- This endpoint remains public because js/directory.js uses it for the public directory.
-- Phone, WhatsApp and email are intentionally excluded from the API response for all roles.
-- 'id' is kept: the Routine Viewer teacher filter (js/routine.js loadRoutineTeachers) needs it,
-- and the current Production function already returns it.

create or replace function public.get_teacher_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'designation', t.designation,
        'subject', t.subject,
        'bcs_batch', t.bcs_batch,
        'biography', t.biography,
        'is_active', t.is_active
      )
      order by t.name
    ),
    '[]'::jsonb
  )
  from public.teachers t;
$function$;

revoke all on function public.get_teacher_directory() from public;
grant execute on function public.get_teacher_directory() to anon, authenticated;
