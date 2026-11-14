-- P0: replace the Teacher Live Report's direct attendance_records read
-- with a token-validated, session-scoped RPC.
-- Branch-only draft. Do not apply to Production without separate approval.

create or replace function public.t_live_attendance(
  p_token text,
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_session public.attendance_sessions%rowtype;
  v_count integer;
  v_rows jsonb;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);

  if v_teacher_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Login expired. Please log in again.'
    );
  end if;

  if p_session_id is null then
    return jsonb_build_object('ok', false, 'message', 'Invalid attendance session.');
  end if;

  select s.* into v_session
  from public.attendance_sessions s
  where s.id = p_session_id;

  if not found
     or not (
       v_session.teacher_id = v_teacher_id
       or public.teacher_owns_course(
         v_teacher_id,
         v_session.session,
         v_session.year,
         v_session.course_code
       )
     ) then
    return jsonb_build_object('ok', false, 'message', 'You are not authorized to view this session.');
  end if;

  select count(*)::integer into v_count
  from public.attendance_records r
  where r.session_id = p_session_id;

  select coalesce(
    jsonb_agg(x.row_data order by x.marked_at desc nulls last),
    '[]'::jsonb
  ) into v_rows
  from (
    select
      r.marked_at,
      jsonb_build_object(
        'marked_at', r.marked_at,
        'students', jsonb_build_object(
          'name', s.name,
          'class_roll', s.class_roll,
          'reg_no', s.reg_no
        )
      ) as row_data
    from public.attendance_records r
    left join public.students s on s.id = r.student_id
    where r.session_id = p_session_id
    order by r.marked_at desc nulls last
    limit 1000
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'truncated', v_count > 1000,
    'rows', v_rows
  );
end
$function$;

revoke all on function public.t_live_attendance(text, uuid) from public;
grant execute on function public.t_live_attendance(text, uuid) to anon, authenticated;
