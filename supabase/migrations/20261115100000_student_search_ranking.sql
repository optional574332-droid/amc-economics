-- Student search ranking (additive replacement of three existing functions; same signatures and
-- same JSON shape; no table, privilege or row is touched).
-- Rule: exact roll/reg first; otherwise partial matches ordered by:
--   roll starts-with > reg starts-with > name word starts-with > roll contains > reg contains > name contains,
-- then numeric roll order.

create or replace function public.pin_student_lookup(
  p_pin text,
  p_query text,
  p_partial boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_session public.attendance_sessions%rowtype;
  v_query text := btrim(coalesce(p_query, ''));
  v_students jsonb;
  v_limit integer := case when coalesce(p_partial, false) then 10 else 5 end;
begin
  if coalesce(length(btrim(p_pin)), 0) <> 4
     or v_query = ''
     or length(v_query) > 80 then
    return jsonb_build_object('ok', false, 'message', 'Invalid PIN or student search.');
  end if;

  select s.* into v_session
  from public.attendance_sessions s
  where s.pin = btrim(p_pin)
    and s.is_active = true
    and s.expires_at > now()
  order by s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PIN is invalid or expired.');
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
      ) order by x.rk, x.roll_num nulls last, x.class_roll
    ),
    '[]'::jsonb
  )
  into v_students
  from (
    select st.id, st.name, st.class_roll, st.reg_no, st.session, st.is_irregular,
      case
        when lower(coalesce(st.class_roll, '')) = lower(v_query)
          or lower(coalesce(st.reg_no, '')) = lower(v_query) then 0
        when starts_with(lower(coalesce(st.class_roll, '')), lower(v_query)) then 1
        when starts_with(lower(coalesce(st.reg_no, '')), lower(v_query)) then 2
        when position((' ' || lower(v_query)) in (' ' || replace(lower(coalesce(st.name, '')), '.', ' '))) > 0 then 3
        when position(lower(v_query) in lower(coalesce(st.class_roll, ''))) > 0 then 4
        when position(lower(v_query) in lower(coalesce(st.reg_no, ''))) > 0 then 5
        else 6
      end as rk,
      case when st.class_roll ~ '^[0-9]{1,15}$' then st.class_roll::bigint end as roll_num
    from public.students st
    where st.year = v_session.year
      and st.session_year = v_session.session_year
      and st.status = 'active'
      and coalesce(st.is_archived, false) = false
      and (
        (not coalesce(p_partial, false)
          and (lower(coalesce(st.class_roll, '')) = lower(v_query)
            or lower(coalesce(st.reg_no, '')) = lower(v_query)))
        or
        (coalesce(p_partial, false)
          and (
            position(lower(v_query) in lower(coalesce(st.class_roll, ''))) > 0
            or position(lower(v_query) in lower(coalesce(st.reg_no, ''))) > 0
            or position(lower(v_query) in lower(coalesce(st.name, ''))) > 0
          ))
      )
    order by rk, roll_num nulls last, st.class_roll
    limit v_limit
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end
$function$;

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
      ) order by x.rk, x.roll_num nulls last, x.class_roll
    ),
    '[]'::jsonb
  ) into v_students
  from (
    select s.id, s.name, s.class_roll, s.reg_no, s.session, s.is_irregular,
      case
        when lower(coalesce(s.class_roll, '')) = lower(v_query)
          or lower(coalesce(s.reg_no, '')) = lower(v_query) then 0
        when starts_with(lower(coalesce(s.class_roll, '')), lower(v_query)) then 1
        when starts_with(lower(coalesce(s.reg_no, '')), lower(v_query)) then 2
        when position((' ' || lower(v_query)) in (' ' || replace(lower(coalesce(s.name, '')), '.', ' '))) > 0 then 3
        when position(lower(v_query) in lower(coalesce(s.class_roll, ''))) > 0 then 4
        when position(lower(v_query) in lower(coalesce(s.reg_no, ''))) > 0 then 5
        else 6
      end as rk,
      case when s.class_roll ~ '^[0-9]{1,15}$' then s.class_roll::bigint end as roll_num
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
    order by rk, roll_num nulls last, s.class_roll
    limit v_limit
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end
$function$;

-- Device tracking student search: exact roll/reg match only if any exists, else ranked partial matches.
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

  select coalesce(jsonb_agg(
           jsonb_build_object('id', m.id, 'name', m.name, 'class_roll', m.class_roll, 'reg_no', m.reg_no,
                              'session', m.session, 'session_year', m.session_year, 'year', m.year)
           order by m.rk, m.session_year desc, m.year, m.roll_num nulls last, m.class_roll), '[]'::jsonb)
  into v_students
  from (
    select * from (
      select st.id, st.name, st.class_roll, st.reg_no, st.session, st.session_year, st.year,
        case
          when lower(coalesce(st.class_roll, '')) = lower(v_query)
            or lower(coalesce(st.reg_no, '')) = lower(v_query) then 0
          when starts_with(lower(coalesce(st.class_roll, '')), lower(v_query)) then 1
          when starts_with(lower(coalesce(st.reg_no, '')), lower(v_query)) then 2
          when position(lower(v_query) in lower(coalesce(st.class_roll, ''))) > 0 then 4
          else 5
        end as rk,
        case when st.class_roll ~ '^[0-9]{1,15}$' then st.class_roll::bigint end as roll_num
      from public.students st
      where position(lower(v_query) in lower(coalesce(st.class_roll, ''))) > 0
         or position(lower(v_query) in lower(coalesce(st.reg_no, ''))) > 0
    ) c
    where c.rk = 0
       or not exists (
         select 1 from public.students e
         where lower(coalesce(e.class_roll, '')) = lower(v_query)
            or lower(coalesce(e.reg_no, '')) = lower(v_query)
       )
    order by c.rk, c.session_year desc, c.year, c.roll_num nulls last, c.class_roll
    limit 50
  ) m;

  return jsonb_build_object('ok', true, 'students', v_students);
end
$function$;
