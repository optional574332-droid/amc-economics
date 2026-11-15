-- Admin-only GPS review flags (additive: one new read-only function; no table, privilege or row changes).
--   shared_device : one device marked attendance for 6 or more different students in the same session
--                   (real data: sharing one phone among 2-5 students is common, so a lower limit is not useful)
--   same_coords   : 3 or more different students in the same session share exactly the same coordinates (6 decimals)
-- `detail` = how many different students are involved. These are review hints, not proof.
drop function if exists public.admin_gps_attendance_flags(date, date, text);

create function public.admin_gps_attendance_flags(
  p_from date,
  p_to date,
  p_year text default null
)
returns table(attendance_id uuid, flag text, detail integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: admin login required';
  end if;
  if p_from is null or p_to is null or p_from > p_to or (p_to - p_from) > 93 then
    raise exception 'Invalid date range (maximum 93 days)';
  end if;

  return query
  with base as (
    select ar.id as rec_id, ar.session_id as sess_id, ar.student_id as stud_id,
           nullif(btrim(ar.device_id), '') as dev_id,
           gal.latitude as lat, gal.longitude as lng
    from public.attendance_records ar
    join public.attendance_sessions s on s.id = ar.session_id
    left join public.geo_attendance_locations gal on gal.attendance_record_id = ar.id
    where s.date between p_from and p_to
      and (p_year is null or s.year = p_year)
  ),
  dev as (
    select b.sess_id, b.dev_id, count(distinct b.stud_id)::integer as n
    from base b
    where b.dev_id is not null
    group by b.sess_id, b.dev_id
    having count(distinct b.stud_id) >= 6
  ),
  loc as (
    select b.sess_id, round(b.lat::numeric, 6) as lat6, round(b.lng::numeric, 6) as lng6,
           count(distinct b.stud_id)::integer as n
    from base b
    where b.lat is not null and b.lng is not null
    group by b.sess_id, round(b.lat::numeric, 6), round(b.lng::numeric, 6)
    having count(distinct b.stud_id) >= 3
  )
  select b.rec_id, 'shared_device'::text, d.n
  from base b join dev d on d.sess_id = b.sess_id and d.dev_id = b.dev_id
  union all
  select b.rec_id, 'same_coords'::text, l.n
  from base b join loc l on l.sess_id = b.sess_id
   and l.lat6 = round(b.lat::numeric, 6) and l.lng6 = round(b.lng::numeric, 6);
end
$function$;

revoke all on function public.admin_gps_attendance_flags(date, date, text) from public, anon;
grant execute on function public.admin_gps_attendance_flags(date, date, text) to authenticated;
