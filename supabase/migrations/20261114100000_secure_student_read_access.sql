-- P0: secure student login and self-only dashboard reads.
-- Branch-only migration draft. Do not apply to Production before separate approval.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create table if not exists private.student_access_tokens (
  token_hash bytea primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table private.student_access_tokens enable row level security;
revoke all on table private.student_access_tokens from public, anon, authenticated;

create or replace function private.student_login_secure_impl(
  p_session text,
  p_roll text,
  p_registration text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_matches integer;
  v_key text;
  v_lock integer;
  v_token text;
begin
  if coalesce(length(trim(p_session)), 0) = 0
     or coalesce(length(trim(p_roll)), 0) = 0
     or length(p_session) > 30 or length(p_roll) > 80
     or coalesce(length(p_registration), 0) > 80 then
    return jsonb_build_object('ok', false, 'message', 'Student login failed. Check your details.');
  end if;

  v_key := 'student-login:' || encode(
    extensions.digest(convert_to(lower(trim(p_session)) || '|' || lower(trim(p_roll)), 'UTF8'), 'sha256'),
    'hex'
  );
  v_lock := public._lock_remaining(v_key);
  if v_lock > 0 then
    return jsonb_build_object('ok', false, 'message', 'Too many attempts. Try again in ' || v_lock || ' minute(s).');
  end if;

  select count(*) into v_matches
  from public.students s
  where s.session = trim(p_session)
    and (s.class_roll = trim(p_roll) or lower(coalesce(s.reg_no, '')) = lower(trim(p_roll)))
    and s.status = 'active'
    and coalesce(s.is_archived, false) = false;

  if v_matches <> 1 then
    perform public._register_failure(v_key, 5, interval '15 minutes', interval '5 minutes');
    return jsonb_build_object('ok', false, 'message', 'Student login failed. Check your details.');
  end if;

  select s.* into v_student
  from public.students s
  where s.session = trim(p_session)
    and (s.class_roll = trim(p_roll) or lower(coalesce(s.reg_no, '')) = lower(trim(p_roll)))
    and s.status = 'active'
    and coalesce(s.is_archived, false) = false
  limit 1;

  if nullif(trim(coalesce(v_student.reg_no, '')), '') is not null
     and lower(trim(coalesce(p_registration, ''))) <> lower(trim(v_student.reg_no)) then
    perform public._register_failure(v_key, 5, interval '15 minutes', interval '5 minutes');
    return jsonb_build_object('ok', false, 'message', 'Student login failed. Check your details.');
  end if;

  delete from public.login_attempts where key = v_key;

  -- One active student login at a time: revoke earlier tokens before issuing a new one.
  delete from private.student_access_tokens
   where expires_at < now() - interval '30 days'
      or revoked_at < now() - interval '30 days';
  update private.student_access_tokens
     set revoked_at = now()
   where student_id = v_student.id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.student_access_tokens(token_hash, student_id, expires_at)
  values (
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    v_student.id,
    now() + interval '8 hours'
  );

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.name,
      'session', v_student.session,
      'session_year', v_student.session_year,
      'year', v_student.year,
      'class_roll', v_student.class_roll,
      'status', v_student.status,
      'is_irregular', v_student.is_irregular
    )
  );
end
$function$;

create or replace function private.student_get_dashboard_impl(p_student_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_total integer;
  v_attended integer;
  v_history jsonb;
begin
  if coalesce(length(p_student_token), 0) <> 64 then
    return jsonb_build_object('ok', false, 'message', 'Student session expired. Please log in again.');
  end if;

  select s.* into v_student
  from private.student_access_tokens t
  join public.students s on s.id = t.student_id
  where t.token_hash = extensions.digest(convert_to(p_student_token, 'UTF8'), 'sha256')
    and t.revoked_at is null
    and t.expires_at > now()
    and s.status = 'active'
    and coalesce(s.is_archived, false) = false
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Student session expired. Please log in again.');
  end if;

  with held as (
    select a.id
    from public.attendance_sessions a
    where a.year = v_student.year
      and a.session_year = v_student.session_year
      and exists (
        select 1 from public.attendance_records r
        where r.session_id = a.id and r.status in ('present', 'late')
      )
  )
  select count(*)::integer into v_total from held;

  with held as (
    select a.id
    from public.attendance_sessions a
    where a.year = v_student.year
      and a.session_year = v_student.session_year
      and exists (
        select 1 from public.attendance_records r
        where r.session_id = a.id and r.status in ('present', 'late')
      )
  )
  select count(*)::integer into v_attended
  from public.attendance_records r
  join held h on h.id = r.session_id
  where r.student_id = v_student.id and r.status in ('present', 'late');

  select coalesce(jsonb_agg(x.row_data order by x.class_date desc), '[]'::jsonb)
    into v_history
  from (
    select
      jsonb_build_object(
        'status', r.status,
        'session_id', r.session_id,
        'attendance_sessions', jsonb_build_object(
          'course_code', a.course_code,
          'date', a.date
        )
      ) as row_data,
      a.date as class_date
    from public.attendance_records r
    join public.attendance_sessions a on a.id = r.session_id
    where r.student_id = v_student.id
    order by a.date desc, r.marked_at desc nulls last
    limit 100
  ) x;

  return jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.name,
      'session', v_student.session,
      'session_year', v_student.session_year,
      'year', v_student.year,
      'class_roll', v_student.class_roll,
      'status', v_student.status,
      'is_irregular', v_student.is_irregular
    ),
    'total_classes', v_total,
    'attended_classes', v_attended,
    'attendance_records', v_history
  );
end
$function$;

create or replace function private.student_logout_impl(p_student_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(length(p_student_token), 0) <> 64 then return false; end if;
  update private.student_access_tokens
     set revoked_at = now()
   where token_hash = extensions.digest(convert_to(p_student_token, 'UTF8'), 'sha256')
     and revoked_at is null;
  return found;
end
$function$;

-- Public PostgREST entry points are SECURITY INVOKER wrappers.
create or replace function public.student_login_secure(p_session text, p_roll text, p_registration text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.student_login_secure_impl(p_session, p_roll, p_registration);
$function$;

create or replace function public.student_get_dashboard(p_student_token text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.student_get_dashboard_impl(p_student_token);
$function$;

create or replace function public.student_logout_secure(p_student_token text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.student_logout_impl(p_student_token);
$function$;

revoke all on function private.student_login_secure_impl(text, text, text) from public;
revoke all on function private.student_get_dashboard_impl(text) from public;
revoke all on function private.student_logout_impl(text) from public;
grant execute on function private.student_login_secure_impl(text, text, text) to anon, authenticated;
grant execute on function private.student_get_dashboard_impl(text) to anon, authenticated;
grant execute on function private.student_logout_impl(text) to anon, authenticated;

revoke all on function public.student_login_secure(text, text, text) from public;
revoke all on function public.student_get_dashboard(text) from public;
revoke all on function public.student_logout_secure(text) from public;
grant execute on function public.student_login_secure(text, text, text) to anon, authenticated;
grant execute on function public.student_get_dashboard(text) to anon, authenticated;
grant execute on function public.student_logout_secure(text) to anon, authenticated;
