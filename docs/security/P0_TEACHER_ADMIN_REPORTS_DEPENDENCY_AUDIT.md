# P0 Read-Access Hardening — Teacher, Admin and Reports Dependency Audit

Date: 2026-11-14
Branch: `security/p0-read-access-hardening`
Scope: Static source review only. No database changes or runtime tests.

## Executive result

The current frontend still has multiple direct reads of `students` and `attendance_records`. These are not safe to remove or restrict until the corresponding workflows are moved behind server-side functions and verified. In particular, several Teacher features fetch records directly and rely on browser-side filtering or a client-supplied identifier.

The existing Production audit recorded permissive SELECT policies (`students_read` and `att_read`, both `USING (true)`) and anon SELECT grants on these tables. Reconfirm the live catalog before any rollout. If still present, the direct paths below are exposed to unauthenticated Data API reads according to their filters; frontend visibility is not an authorization boundary.

## Findings

### P0 — Teacher live attendance report reads records directly by session ID
- File: `js/teacher.js`, around lines 482–483.
- The client selects `attendance_records` by `session_id` and joins student name, roll and registration number.
- The session ID is supplied by the client-side flow. The query itself does not pass or validate the teacher token.
- The result populates the live count and list; Realtime also subscribes to changes for that session.
- Required replacement: token-validated RPC that checks the session belongs to the teacher (or explicit permitted sharing rule) and returns only the minimal live roster. Realtime subscription authorization must be reviewed separately; replacing the initial SELECT alone is insufficient.

### P0 — Teacher attendance report fetches attendance rows directly
- File: `js/teacher.js`, around lines 604–608.
- The client obtains session IDs through `t_my_sessions` / `t_my_bulk_sessions`, then directly selects `attendance_records` for those IDs and joins student details.
- A later browser-side filter attempts to hide rows from sessions owned by another teacher unless they are that teacher's own Bulk rows.
- Browser-side filtering cannot protect data already returned to the browser.
- Required replacement: one RPC that validates the teacher token, computes permitted sessions and row-level ownership rules on the server, and returns only authorized report rows with bounded date range and pagination.

### P0 — Device and student tracking queries read attendance records directly
- File: `js/teacher.js`, around lines 927 and 964.
- Device search selects attendance records by a client-supplied device prefix; student search selects by client-supplied student ID. Both include device ID, student details, timestamps and session/course details.
- These are sensitive tracking datasets and cannot rely on the Teacher panel being hidden behind login.
- Required replacement: token-validated tracking RPCs that check teacher/admin authorization, constrain the requested student/device to the teacher's permitted scope, enforce date windows and row limits, and avoid exposing GPS coordinates unless specifically required.

### P1 — Teacher manual attendance directly searches student records
- File: `js/teacher.js`, around lines 245–246 and 526.
- Manual-entry search and fallback lookup directly query `students` to resolve an active student and obtain the ID/name before calling `t_manual_attendance`.
- Required replacement: a token-validated student lookup RPC constrained to the selected course/year/session-year, returning only the fields required for manual attendance. Keep `t_manual_attendance` as the final write authorization boundary.

### P1 — Existing PIN attendance workflow directly searches students
- File: `js/attendance.js`, around lines 315–317 and 382–386.
- The PIN attendance workflow searches active students and resolves a student ID in the browser before calling the attendance submission flow.
- Offline mode also reads a local cache named `amc_students_*`; cached data must be treated as untrusted and must not replace server-side validation at submission.
- Required replacement: a minimal student lookup RPC scoped to the authorized PIN session, while retaining server-side checks in `student_mark_attendance_v4`.

### P0 — Reports directly read student and attendance data
- File: `js/reports.js`, around lines 304, 312, 496 and 509.
- Admin/teacher report code directly fetches student lists and individual students' attendance rows. The exact permitted scope differs by report type.
- Required replacement: separate server-side report functions with explicit admin or teacher-token authorization, bounded date ranges, pagination and only necessary fields. Do not use one generic RPC that accepts arbitrary student IDs.

### P0 — Admin student management relies on direct table operations
- File: `js/people.js`, around lines 261, 362–364, 392, 414, 475, 502, 568, 587 and 601.
- Admin flows directly read, insert, update and delete student rows; promotion and bulk update also call dedicated RPCs.
- Restricting student table access without first migrating these operations would break student import, edit, status changes, promotion preview, and deletion.
- Required replacement: verify every operation is protected by the authenticated admin check and move table mutations to narrowly scoped admin RPCs where current RLS/grants do not already provide a robust boundary. Preserve the existing admin UI and duplicate checks.

### P1 — Admin and Teacher workflows depend on additional tables/functions
- `js/teacher.js` also directly reads `attendance_sessions` and uses token-validated RPCs such as `t_create_session`, `t_close_session`, `t_manual_attendance`, `t_update_status`, `t_get_marks`, and `t_save_mark`.
- `js/attendance.js` reads teacher names from `teachers`.
- `js/reports.js` uses `get_held_sessions`, `get_available_session_years`, `t_my_sessions`, `get_session_by_pin`, and `get_gps_attendance_report`.
- Do not revoke EXECUTE from these RPCs or change their grants until each function's authorization logic and caller are individually inspected. Some anon-callable RPCs intentionally validate a PIN or teacher token internally.

## Recommended migration sequence

1. Complete a read-only catalog review of exact table grants, RLS policies, function definitions and Realtime publication/authorization for all affected tables.
2. Build and statically review separate teacher RPCs for live roster, attendance report, manual student lookup and device/student tracking.
3. Build and statically review admin-only RPCs for student listing, import, edit, status changes and deletion. Preserve promotion/bulk-update semantics.
4. Replace report queries with role-scoped report RPCs and verify Excel/PDF data contracts.
5. Replace PIN workflow student lookup while retaining offline cache only as a convenience and retaining server-side attendance validation.
6. Only after all dependencies are migrated and verified, prepare a staged policy/grant change. Do not remove public SELECT policies or grants in advance.
7. Before Production rollout, use an independently approved controlled test/rollout plan. At the user's direction, no Local Supabase runtime test is being performed; static review is not equivalent to runtime verification.

## Explicit safety boundary

- No Production SQL, schema, policies, grants, attendance records, student records, GPS records or tokens were changed.
- No frontend code was changed in this audit step.
- No PR, merge or deployment was performed.
- This document records static source dependencies, not a claim that the workflows have been runtime-tested.

## Implementation checkpoint — Teacher Live Report (2026-11-14)

Implemented on the isolated branch only:

- Added `supabase/migrations/20261114123000_teacher_live_report_secure_rpc.sql`.
- Added `public.t_live_attendance(p_token, p_session_id)`, a SECURITY DEFINER RPC with an empty search_path.
- The RPC validates the teacher token through `_teacher_id_from_token`, then checks that the teacher owns the session or is assigned to that session's course/year before returning student name, roll, registration number, and marked time.
- Response is bounded to 1,000 rows and includes total count plus a truncation indicator.
- Updated `js/teacher.js` so Live Report no longer directly selects from `attendance_records`; it uses the scoped RPC and retains the existing 5-second refresh interval.
- Removed the ineffective Realtime subscription from this Live Report path. The Production publication query showed `attendance_records` is not currently included in any publication.

Static branch checks passed for: token validation, session/course authorization, empty search_path, public EXECUTE revocation, bounded result size, frontend RPC usage, removal of the direct Live Report SELECT, 5-second polling, and RPC error display.

**Not yet closed:** the Production table-level `anon` SELECT grant and `att_read USING (true)` policy remain in place. Other Teacher/Admin/Reports screens still contain direct table reads, so removing those grants/policies before migrating their dependencies could break existing workflows. This Live Report change is therefore a scoped first step, not a complete closure of the P0 public-read exposure.

No Production SQL was applied. No merge or deployment was performed. Runtime behavior was not tested.

## Implementation checkpoint — Teacher attendance reports (2026-11-14)

Added on the isolated branch:

- `supabase/migrations/20261114130000_teacher_attendance_report_secure_rpc.sql` introduces `t_teacher_attendance_records(p_token, p_session_ids)`.
- The RPC validates the teacher token and returns rows only from sessions owned by that teacher, or the teacher's own Bulk rows in an approved course they teach. It does not return another teacher's PIN/manual roster from a shared session.
- The RPC accepts at most 25 session IDs per call and caps each response at 10,000 rows with a truncation indicator.
- `js/teacher.js` now fetches Teacher Attendance Report rows in 25-session batches through this RPC instead of directly selecting `attendance_records`. The existing shared-session client filter remains as defense in depth.
- A truncated response is surfaced as a prompt to narrow the report date range rather than silently displaying incomplete data.

Static branch checks were run for both Teacher Live Report and Teacher Attendance Report: scoped RPC calls are present, direct `attendance_records` reads are absent from those two report functions, token checks and ownership rules are present in the migration drafts, and result bounds/error handling are present.

Remaining Teacher direct reads identified in the audit (manual attendance/student lookup and device tracking) have not yet been migrated. Admin and general Reports direct reads also remain. The public `att_read USING (true)` policy and `anon` SELECT grant remain unchanged until dependent workflows are migrated.

No Production SQL was applied; no merge or deployment was performed. Runtime testing was not performed.


## Implementation checkpoint — Teacher Device Tracking (2026-11-14)

Added on the isolated branch only:

- `supabase/migrations/20261114140000_secure_teacher_device_tracking.sql` adds `t_teacher_tracking_students` and `t_teacher_tracking_records`.
- Both RPCs validate the active teacher token through `_teacher_id_from_token`, use an empty `search_path`, revoke default PUBLIC execution, and grant execution only to the API roles that call the RPC with a token.
- Per the department's explicit choice, any active teacher may search tracking information across all department students. The RPC returns only the fields used by the existing tracking interface; GPS coordinates and accuracy fields are not returned.
- Student search is limited to 50 matches. Tracking records are limited to the latest 500 matches, return total count/truncation metadata, and date ranges are limited to 366 days. The interface warns when the 500-row cap is reached.
- `js/teacher.js` now uses these RPCs for Device ID and student roll/registration tracking instead of direct reads from `students` and `attendance_records`. Existing table display, suspicious-activity analysis, and Excel/PDF export data shape are retained.

Static checks confirmed the two RPC calls are wired in the frontend, direct table reads are absent from the Device Tracking functions, token validation and result limits are present, and no GPS-coordinate columns are selected. This does not constitute SQL execution, browser runtime testing, or a security penetration test.

Remaining direct Teacher reads still include manual-attendance student lookup and fallback resolution. Admin and general Reports direct reads also remain. The public `att_read USING (true)` policy and `anon` SELECT grant have intentionally not been removed because other workflows still depend on direct table access.

No Production SQL was applied; no merge or deployment was performed. Runtime testing was not performed.


## Manual Attendance Student Lookup hardening (2026-11-14)
- Added branch-only RPC migration `20261114150000_secure_teacher_manual_student_lookup.sql`.
- The RPC requires an active teacher token, the selected class year, exact selected course assignment, session year, and a bounded search query. It returns only active, non-archived students from that class/session year, with the limited fields required by Manual Attendance.
- `js/teacher.js` now uses this RPC for online suggestions and the no-selection exact-match fallback; direct browser reads from `students` were removed from these two Manual Attendance lookup paths. Offline local-cache lookup remains unchanged; the final `t_manual_attendance` RPC still validates the selected student against the session class/session year and active status.
- No changes were made to the attendance write RPC, existing attendance records, offline cache, or Production database.
- Static review only: frontend call arguments and RPC signature were checked; SQL was not executed, browser behavior was not runtime-tested, and the migration has not been applied to Production.


## P0 Student and Attendance broad-read closure draft (2026-11-14)
- Added branch-only migration `20261114160000_p0_student_attendance_read_hardening.sql`.
- The migration replaces the broad `students_read` policy with an authenticated Admin-only SELECT policy, removes the broad `att_read` policy and adds Admin-only attendance-record SELECT access. Existing Admin CRUD/report workflows remain dependent on the authenticated Admin RLS checks; the existing Admin write policy is retained.
- Anonymous direct table privileges are revoked from `students` and `attendance_records`. The existing Admin promotion and bulk-update RPCs have anonymous execution revoked while authenticated execution remains; both functions already check `is_admin()`.
- PIN Attendance online lookup now calls `pin_student_lookup`, which validates the active, unexpired PIN session and returns only the matching class/session's active, non-archived student fields. PIN roster caching now calls `pin_student_roster`; Teacher offline roster caching calls `t_teacher_student_roster`, which requires an active teacher token and an assigned class year. Existing local cache keys and offline lookup behavior are retained.
- Static checks on the updated branch confirm no direct `students` table reads remain in `js/attendance.js` or `js/utils.js`; PIN lookup and roster RPC call sites are present. Admin Student Management, Admin Dashboard, and Admin Reports retain direct reads, intended to be authorized by the new Admin-only RLS policy.
- Production read-only metadata inspection confirmed the prior broad `students_read USING (true)` and `att_read USING (true)` policies. The `students` table had anonymous SELECT privilege; anonymous privileges on both target tables are revoked by the draft migration. No Production changes were made.
- Verification limitation: the new migration has not been executed against a disposable/local database, SQL syntax and RPC behavior have not been runtime-tested, and browser flows/offline caching have not been tested. Do not apply to Production until the migration is independently reviewed and all critical flows are tested in Preview.

- The Admin-only `get_held_sessions(p_year, p_session_year)` report helper was also hardened in the same migration: it now checks `is_admin()` and its anonymous/public EXECUTE grants are revoked. Other SECURITY DEFINER endpoints surfaced by the advisor require separate intent-aware review; token/PIN-based Teacher and Student endpoints are not blanket-revoked because the app's custom login flows intentionally call them through the anonymous API role.
- The current Production Security Advisor still reports generic SECURITY DEFINER warnings for 28 anon-callable functions and a leaked-password-protection setting warning. The two Admin student mutation RPCs and the held-session report helper are specifically addressed in this branch migration; the remaining warnings include intentional PIN/token endpoints and public informational endpoints, and must be individually reviewed rather than indiscriminately disabled.
