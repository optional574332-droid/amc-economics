-- P0: keep the public Faculty Directory useful without exposing private contact details.
-- This endpoint remains public because js/directory.js uses it for the public directory.
-- Phone, WhatsApp and email are intentionally excluded from the API response for all roles.

create or replace function public.get_teacher_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', t.name,
        'designation', t.designation,
        'subject', t.subject,
        'bcs_batch', t.bcs_batch,
        'biography', t.biography,
        'is_active', t.is_active
      )
      order by t.name
    ),
    '[]'::jsonb
  )
  from public.teachers t;
$function$;

revoke all on function public.get_teacher_directory() from public;
grant execute on function public.get_teacher_directory() to anon, authenticated;
