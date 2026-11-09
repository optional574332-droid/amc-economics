-- GPS report RPC reads coordinates from the existing RLS-protected geo_attendance_locations table.
create or replace function public.get_gps_attendance_report(
 p_from date, p_to date, p_year text default null, p_course_code text default null,
 p_session_year integer default null, p_teacher_token text default null
) returns table(
 attendance_id uuid, attendance_date date, course_code text, class_year text,
 session_year integer, teacher_name text, student_name text, class_roll text,
 reg_no text, status text, marked_at timestamptz, geo_status text,
 geo_distance_m integer, geo_accuracy_m integer, latitude double precision,
 longitude double precision, captured_at timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_teacher_id uuid := null; v_is_admin boolean := false;
begin
 if p_from is null or p_to is null or p_from>p_to or (p_to-p_from)>93 then
   raise exception 'Invalid date range (maximum 93 days)';
 end if;
 v_is_admin := public.is_admin();
 if not v_is_admin then
   v_teacher_id := public._teacher_id_from_token(p_teacher_token);
   if v_teacher_id is null then raise exception 'Unauthorized: valid teacher login or admin login required'; end if;
 end if;
 return query
 select ar.id,s.date,s.course_code,s.year,s.session_year,t.name,st.name,st.class_roll,st.reg_no,
        ar.status,ar.marked_at,ar.geo_status,ar.geo_distance_m,
        coalesce(gal.accuracy_m,ar.geo_accuracy_m),gal.latitude,gal.longitude,gal.captured_at
 from public.attendance_records ar
 join public.attendance_sessions s on s.id=ar.session_id
 join public.students st on st.id=ar.student_id
 left join public.teachers t on t.id=s.teacher_id
 left join public.geo_attendance_locations gal on gal.attendance_record_id=ar.id
 where s.date between p_from and p_to
   and (p_year is null or s.year=p_year)
   and (p_course_code is null or s.course_code=p_course_code)
   and (p_session_year is null or s.session_year=p_session_year)
   and (v_is_admin or s.teacher_id=v_teacher_id or public.teacher_owns_course(v_teacher_id,s.session,s.year,s.course_code))
 order by s.date desc,s.course_code,st.class_roll;
end
$function$;
revoke all on function public.get_gps_attendance_report(date,date,text,text,integer,text) from public;
grant execute on function public.get_gps_attendance_report(date,date,text,text,integer,text) to anon, authenticated;
