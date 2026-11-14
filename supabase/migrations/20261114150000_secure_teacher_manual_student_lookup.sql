-- P0: secure Teacher Manual Attendance student lookup with an active teacher token.
-- Branch-only draft. Do not apply to Production without separate approval.

create or replace function public.t_teacher_manual_student_lookup(
  p_token text,
  p_year text,
  p_course_code text,
  p_session_year integer,
  p_query text,
  p_include_name boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_query text := trim(coalesce(p_query, ''));
  v_students jsonb;
  v_limit integer := case when coalesce(p_include_name, false) then 10 else 5 end;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);

  if v_teacher_id is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired. Please log in again.');
  end if;

  if p_year is null or p_year = ''
     or p_course_code is null or p_course_code = ''
     or p_session_year is null
     or v_query = ''
     or length(v_query) > 80 then
    return jsonb_build_object('ok', false, 'message', 'Enter a valid student search and select class/session year.');
  end if;

  if not exists (
    select 1
    from public.teacher_courses tc
    where tc.teacher_id = v_teacher_id
      and tc.year = p_year
      and tc.course_code = p_course_code
  ) then
    return jsonb_build_object('ok', false, 'message', 'You are not assigned to this class.');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'name', x.name,
        'class_roll', x.class_roll,
        'reg_no', x.reg_no,
        'session', x.session,
        'is_irregular', x.is_irregular
      ) order by
        x.class_roll
    ),
    '[]'::jsonb
  ) into v_students
  from (
    select s.id, s.name, s.class_roll, s.reg_no, s.session, s.is_irregular
    from public.students s
    where s.year = p_year
      and s.session_year = p_session_year
      and s.status = 'active'
      and coalesce(s.is_archived, false) = false
      and (
        (not coalesce(p_include_name, false)
          and (lower(coalesce(s.class_roll, '')) = lower(v_query)
            or lower(coalesce(s.reg_no, '')) = lower(v_query)))
        or
        (coalesce(p_include_name, false)
          and (
            position(lower(v_query) in lower(coalesce(s.class_roll, ''))) > 0
            or position(lower(v_query) in lower(coalesce(s.reg_no, ''))) > 0
            or position(lower(v_query) in lower(coalesce(s.name, ''))) > 0
          ))
      )
    order by s.class_roll
    limit v_limit
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end
$function$;

revoke all on function public.t_teacher_manual_student_lookup(text, text, text, integer, text, boolean) from public;
grant execute on function public.t_teacher_manual_student_lookup(text, text, text, integer, text, boolean) to anon, authenticated;
