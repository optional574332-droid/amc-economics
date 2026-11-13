# P0 Read-Access Hardening Plan

## Scope and safety boundary

This work is isolated to `security/p0-read-access-hardening`. The production database, production deployment, and `main` branch must remain unchanged until a separate, explicit approval is given. Do not apply migrations to the linked production project during implementation or preview testing.

The objective is to remove public direct-table read access to sensitive student and attendance data without breaking the Student, Teacher, or Admin workflows or changing historical attendance records.

## Confirmed exposure in the linked database (read-only inspection)

- `public.students` has a SELECT policy named `students_read` for `PUBLIC` with `USING (true)`.
- `public.attendance_records` has a SELECT policy named `att_read` for `PUBLIC` with `USING (true)`.
- Column-level SELECT grants exist for `anon` on both tables. The exact granted-column set must be re-queried and reviewed as part of the final migration design.
- `public.teacher_tokens` has column-level SELECT grants for `anon` and `authenticated`; no SELECT policy was returned in the policy inspection. This is still unnecessary privilege and must be evaluated with effective-role tests before changing it.
- Existing admin write policies and attendance write-denial policy must be preserved unless a specific dependency is proven and a replacement is tested.

## Frontend dependencies that must be replaced before closing direct reads

### Student panel
- `js/student.js`: student login reads a student by session and roll/registration; dashboard reads that student's attendance history.
- Required replacement: a server-side login/verification RPC that validates the supplied identifiers and returns only the minimum student profile; a separate own-history RPC tied to a server-validated student credential/session. Never trust a client-supplied student UUID alone.

### Teacher workflows
- `js/attendance.js`: searches active students for attendance selection.
- `js/teacher.js`: manual-entry student search; live session attendance list; attendance reports; device tracking by device and student.
- Required replacement: teacher-token-validated RPCs that check token validity, teacher identity, course/session ownership and requested class/session scope before returning minimum necessary fields. Do not expose exact GPS coordinates through general attendance-report RPCs.

### Admin and reports
- `js/reports.js`: cohort/class student reads, attendance aggregation, individual student lookup and attendance records.
- `js/people.js`: student listing, detail, promotion preview, duplicate checks, insert/update/delete and status changes.
- `js/admin.js`: dashboard student counts.
- Required replacement: admin-validated RPCs for dashboard, report aggregation and student management. Preserve existing business rules, uniqueness checks, status handling, pagination and exports.

### GPS
- `js/gps-report.js` calls `get_gps_attendance_report`; this RPC already has explicit admin/teacher validation and must be reviewed, not blindly revoked.
- `js/geo.js` uses `student_mark_attendance_v4`; preserve the current validated attendance path and do not add a legacy fallback.

## Additional function-level review (read-only)

- `student_mark_attendance_v4` validates an active attendance PIN and that the supplied student UUID belongs to the active class/session year. It does not establish the student's identity using a login credential. Therefore it must not be reused as an authorization mechanism for student profile/history reads.
- `get_held_sessions` is a `SECURITY DEFINER` function and returns held-session IDs, course codes, and dates for a class/session year without a student or teacher credential. It does not return student names or attendance rows, but its output should be treated as class-level schedule metadata and bounded/validated.
- `t_manual_attendance` and `t_bulk_attendance` validate the teacher token and verify session/course ownership before writing. Preserve these checks.
- `admin_promote_students` and `bulk_update_students` are `SECURITY DEFINER` functions with internal `is_admin()` checks. Their execute grants still need a complete ACL review; do not revoke or alter them without testing the Admin panel.
- `get_gps_attendance_report` validates either Admin status or teacher token/course ownership. The database function currently accepts a maximum 93-day interval, while the frontend limits selection to 31 days. The database-side limit is authoritative and should be reconciled separately; do not assume the UI limit protects direct RPC calls.

## Implementation sequence

1. Capture current schemas, function definitions, grants, policies, and frontend call contracts. Use read-only SQL only.
2. Implement replacement RPCs with explicit authorization and bounded result sets. Use a fixed `search_path`, validate every input, and return only fields required by the relevant screen.
3. Update each frontend caller to use the new RPC. Keep existing UI, sorting, report filters, Excel/PDF exports, and attendance business rules unchanged.
4. Add a migration file to the branch only after the replacement calls are complete. The migration must revoke direct SELECT privileges (including column-level grants) and remove public read policies only after confirming no frontend caller still depends on direct reads.
5. Test anon, teacher, and admin behavior in an isolated preview/test environment. Verify unauthorized reads fail, authorized workflows still work, exports remain correct, and historical records are unchanged.
6. Review SQL grants, RLS, function ownership/security mode, fixed search paths, and Supabase security advisors.
7. Open a draft PR for review. Production merge/deployment and database migration require a separate explicit approval.

## Non-goals for this P0 change

- No deletion or alteration of historical attendance rows.
- No change to GPS retention or geofence settings.
- No blanket revocation of anonymous EXECUTE on RPCs: several existing public RPCs validate teacher tokens or student PINs internally.
- No changes to offline attendance, UI design, sorting, or attendance workflow unless required for the read-access replacement.

## Current implementation status

- Branch created from `main`.
- Read-only database inspection confirms broad public SELECT policies on `students` and `attendance_records`, plus anonymous column grants.
- Frontend direct-read dependencies mapped for the primary student, teacher, admin, reports, and GPS flows.
- A documentation-only plan has been committed to this branch (no application behavior changed).\n- Function-level review has identified the authentication boundary that must be designed before student history can be exposed safely.\n- No application code, database schema, production data, or deployment has been changed.
