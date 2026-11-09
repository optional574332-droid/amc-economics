-- Retain private GPS coordinates for 90 days only.
-- Attendance history is intentionally preserved: this migration never deletes
-- rows from public.attendance_records or public.attendance_sessions.

create extension if not exists pg_cron with schema pg_catalog;

-- Supabase's managed pg_cron schema is restricted by default; keep ownership
-- and job management with the postgres role.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Supports efficient daily pruning as the GPS table grows.
create index if not exists idx_geo_attendance_locations_captured_at
  on public.geo_attendance_locations (captured_at);

comment on table public.geo_attendance_locations is
  'Private GPS coordinates retained for 90 days. Older coordinates are automatically deleted; attendance records remain permanently retained.';

-- Re-scheduling with the same job name updates the existing job, making this
-- migration safe to re-run without creating duplicate retention jobs.
select cron.schedule(
  'gps-coordinate-retention-90-days',
  '15 2 * * *',
  $job$
    delete from public.geo_attendance_locations
    where captured_at < now() - interval '90 days';
  $job$
);

-- pg_cron records each execution. Keep only 30 days of scheduler history so
-- the maintenance mechanism does not itself grow without bound.
select cron.schedule(
  'gps-retention-cron-history-cleanup',
  '45 2 * * *',
  $job$
    delete from cron.job_run_details
    where end_time < now() - interval '30 days';
  $job$
);
