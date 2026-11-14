-- P0: close broad Student and Attendance Record table reads without breaking
-- Admin reports, Teacher/PIN attendance lookup, or offline roster caching.
-- Branch-only migration draft. Do not apply to Production without separate approval.

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

-- Exact/partial PIN-based lookup used by the public PIN attendance form.
-- The supplied PIN must resolve to a currently active, unexpired session.
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
      ) order by x.class_roll
    ),
    '[]'::jsonb
  )
  into v_students
  from (
    select st.id, st.name, st.class_roll, st.reg_no, st.session, st.is_irregular
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
    order by st.class_roll
    limit v_limit
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end
$function$;

-- Full class roster for the existing offline cache. A live PIN is required.
create or replace function public.pin_student_roster(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_session public.attendance_sessions%rowtype;
  v_count integer;
  v_students jsonb;
begin
  if coalesce(length(btrim(p_pin)), 0) <> 4 then
    return jsonb_build_object('ok', false, 'message', 'Invalid PIN.');
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

  select count(*)::integer into v_count
  from public.students st
  where st.year = v_session.year
    and st.session_year = v_session.session_year
    and st.status = 'active'
    and coalesce(st.is_archived, false) = false;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'name', x.name,
        'class_roll', x.class_roll,
        'reg_no', x.reg_no,
        'session', x.session,
        'is_irregular', x.is_irregular
      ) order by x.class_roll
    ),
    '[]'::jsonb
  )
  into v_students
  from (
    select st.id, st.name, st.class_roll, st.reg_no, st.session, st.is_irregular
    from public.students st
    where st.year = v_session.year
      and st.session_year = v_session.session_year
      and st.status = 'active'
      and coalesce(st.is_archived, false) = false
    order by st.class_roll
    limit 2000
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'truncated', v_count > 2000,
    'students', v_students
  );
end
$function$;

-- Teacher offline cache uses an active teacher token and a year they teach.
create or replace function public.t_teacher_student_roster(
  p_token text,
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
  v_teacher_id uuid;
  v_count integer;
  v_students jsonb;
begin
  v_teacher_id := public._teacher_id_from_token(p_token);
  if v_teacher_id is null then
    return jsonb_build_object('ok', false, 'message', 'Login expired. Please log in again.');
  end if;

  if p_year is null or p_year = '' or p_session_year is null then
    return jsonb_build_object('ok', false, 'message', 'Select a valid class and session year.');
  end if;

  if not exists (
    select 1 from public.teacher_courses tc
    where tc.teacher_id = v_teacher_id and tc.year = p_year
  ) then
    return jsonb_build_object('ok', false, 'message', 'You are not assigned to this class.');
  end if;

  select count(*)::integer into v_count
  from public.students st
  where st.year = p_year
    and st.session_year = p_session_year
    and st.status = 'active'
    and coalesce(st.is_archived, false) = false;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'name', x.name,
        'class_roll', x.class_roll,
        'reg_no', x.reg_no,
        'session', x.session,
        'is_irregular', x.is_irregular
      ) order by x.class_roll
    ),
    '[]'::jsonb
  )
  into v_students
  from (
    select st.id, st.name, st.class_roll, st.reg_no, st.session, st.is_irregular
    from public.students st
    where st.year = p_year
      and st.session_year = p_session_year
      and st.status = 'active'
      and coalesce(st.is_archived, false) = false
    order by st.class_roll
    limit 2000
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'truncated', v_count > 2000,
    'students', v_students
  );
end
$function$;

revoke all on function public.pin_student_lookup(text, text, boolean) from public;
grant execute on function public.pin_student_lookup(text, text, boolean) to anon, authenticated;

revoke all on function public.pin_student_roster(text) from public;
grant execute on function public.pin_student_roster(text) to anon, authenticated;

revoke all on function public.t_teacher_student_roster(text, text, integer) from public;
grant execute on function public.t_teacher_student_roster(text, text, integer) to anon, authenticated;

-- Admin-only mutation RPCs must not be callable by the anonymous API role.
revoke all on function public.admin_promote_students(text, integer, uuid[], boolean) from public, anon;
grant execute on function public.admin_promote_students(text, integer, uuid[], boolean) to authenticated;

revoke all on function public.bulk_update_students(integer, text, jsonb) from public, anon;
grant execute on function public.bulk_update_students(integer, text, jsonb) to authenticated;

-- Held-session metadata is consumed by the Admin Attendance Report only.
-- Do not leave this SECURITY DEFINER report helper publicly callable.
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
