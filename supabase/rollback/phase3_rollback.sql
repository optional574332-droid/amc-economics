-- ROLLBACK for 20261114180000_p0_phase3_lockdown.sql
-- Restores the exact previous (Production, 14 Nov 2026) policies, privileges and function bodies.
-- Run only if something breaks after Phase 3. No data is touched.

-- 1) Table policies and privileges
drop policy if exists students_admin_read on public.students;
create policy students_read on public.students for select to public using (true);
drop policy if exists att_admin_read on public.attendance_records;
create policy att_read on public.attendance_records for select to public using (true);

grant select (admission_date, class_roll, created_at, id, is_archived, is_irregular, name, reg_no, session, session_year, status, tc_date, year)
  on public.students to anon;
grant select (attendance_source, device_id, geo_accuracy_m, geo_distance_m, geo_status, id, marked_at, marked_by, session_id, status, student_id, updated_at, updated_by)
  on public.attendance_records to anon;

-- 2) Function execute rights as they were
grant execute on function public.admin_promote_students(text, integer, uuid[], boolean) to anon;
grant execute on function public.bulk_update_students(integer, text, jsonb) to anon;
grant execute on function public.get_held_sessions(text, integer) to anon;
grant execute on function public.teacher_owns_course(uuid, text, text, text) to anon, authenticated;

-- 3) Previous function bodies
CREATE OR REPLACE FUNCTION public.get_held_sessions(p_year text, p_session_year integer)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'course_code', s.course_code, 'date', s.date) order by s.date, s.course_code), '[]'::jsonb)
  from public.attendance_sessions s
  where s.year = p_year
    and s.session_year = p_session_year
    and exists (select 1 from public.attendance_records r where r.session_id = s.id and r.status in ('present','late'));
$function$;

CREATE OR REPLACE FUNCTION public.get_teacher_directory()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'designation', t.designation, 'subject', t.subject,
    'bcs_batch', t.bcs_batch, 'mobile', t.mobile, 'whatsapp', t.whatsapp,
    'email', t.email, 'biography', t.biography, 'is_active', t.is_active
  ) order by t.name), '[]'::jsonb)
  from public.teachers t;
$function$;

CREATE OR REPLACE FUNCTION public.t_session_students(p_token text, p_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tid uuid := _teacher_id_from_token(p_token);
  v_date date := (now() at time zone 'Asia/Dhaka')::date;
  v_s record;
  v_recs jsonb;
begin
  if v_tid is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired, please login again');
  end if;
  select * into v_s from attendance_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Session not found');
  end if;
  if v_s.date <> v_date then
    return jsonb_build_object('ok', false, 'message', 'Only today''s classes can be viewed here');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'status', r.status, 'marked_at', r.marked_at,
           'class_roll', st.class_roll, 'reg_no', st.reg_no, 'name', st.name,
           'is_irregular', st.is_irregular,
           'geo_status', r.geo_status, 'geo_distance_m', r.geo_distance_m)), '[]'::jsonb)
    into v_recs
  from attendance_records r
  join students st on st.id = r.student_id
  where r.session_id = p_session_id;

  return jsonb_build_object('ok', true, 'records', v_recs);
end
$function$;
