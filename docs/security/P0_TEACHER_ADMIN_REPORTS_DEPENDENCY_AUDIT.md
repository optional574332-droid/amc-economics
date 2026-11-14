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
