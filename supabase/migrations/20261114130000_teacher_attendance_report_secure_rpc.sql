-- P0: return only attendance rows a teacher is authorized to see.
-- Branch-only draft. Do not apply to Production without separate approval.

create or replace function public.t_teacher_attendance_records(
  p_token text,
  p_session_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_records jsonb;
  v_count integer;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);

  if v_teacher_id is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired. Please log in again.');
  end if;

  if p_session_ids is null
     or coalesce(array_length(p_session_ids, 1), 0) = 0
     or array_length(p_session_ids, 1) > 25 then
    return jsonb_build_object('ok', false, 'message', 'Invalid session list. Request up to 25 sessions at a time.');
  end if;

  with allowed_records as (
    select
      r.id, r.session_id, r.student_id, r.status, r.marked_at,
      r.device_id, r.marked_by, r.attendance_source,
      st.name as student_name,
      st.class_roll as student_roll,
      st.reg_no as student_reg
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    left join public.students st on st.id = r.student_id
    where r.session_id = any(p_session_ids)
      and (
        s.teacher_id = v_teacher_id
        or (
          r.marked_by = v_teacher_id
          and r.attendance_source = 'bulk'
          and public.teacher_owns_course(
            v_teacher_id, s.session, s.year, s.course_code
          )
        )
      )
  )
  select count(*)::integer into v_count from allowed_records;

  with allowed_records as (
    select
      r.id, r.session_id, r.student_id, r.status, r.marked_at,
      r.device_id, r.marked_by, r.attendance_source,
      st.name as student_name,
      st.class_roll as student_roll,
      st.reg_no as student_reg
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    left join public.students st on st.id = r.student_id
    where r.session_id = any(p_session_ids)
      and (
        s.teacher_id = v_teacher_id
        or (
          r.marked_by = v_teacher_id
          and r.attendance_source = 'bulk'
          and public.teacher_owns_course(
            v_teacher_id, s.session, s.year, s.course_code
          )
        )
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'session_id', x.session_id,
        'student_id', x.student_id,
        'status', x.status,
        'marked_at', x.marked_at,
        'device_id', x.device_id,
        'marked_by', x.marked_by,
        'attendance_source', x.attendance_source,
        'students', jsonb_build_object(
          'name', x.student_name,
          'class_roll', x.student_roll,
          'reg_no', x.student_reg
        )
      ) order by x.marked_at desc nulls last
    ),
    '[]'::jsonb
  ) into v_records
  from (
    select * from allowed_records
    order by marked_at desc nulls last
    limit 10000
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'truncated', v_count > 10000,
    'records', v_records
  );
end
$function$;

revoke all on function public.t_teacher_attendance_records(text, uuid[]) from public;
grant execute on function public.t_teacher_attendance_records(text, uuid[]) to anon, authenticated;
