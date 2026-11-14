# P0 Security Hardening — Implementation Notes

Branch: `security/p0-read-access-hardening`

## Safety boundary
- This branch is isolated from `main`.
- No Production database DDL, grants, policies, data, or migrations have been changed.
- No Production deployment or merge has been performed.
- Existing attendance and student records must remain unchanged.

## Confirmed database findings (read-only inspection)
- `public.attendance_records` has a SELECT policy named `att_read` with `USING (true)`, applying to `PUBLIC`.
- `public.students` has a SELECT policy named `students_read` with `USING (true)`, applying to `PUBLIC`.
- Current catalog output also shows column-level SELECT grants to `anon` on both tables. The tables therefore require a complete access-path review; revoking only table-level grants is insufficient.
- `teacher_tokens` has broad column-level grants in the catalog output. Its RLS policy state and actual effective access must be tested independently before any change.
- `attendance_records` also has broad non-SELECT grants in the catalog output. RLS currently limits row operations, but these grants should be reduced only after confirming every RPC and client workflow dependency.

## Frontend dependencies that must be replaced before restricting direct reads
- Student login currently selects a student row from `students` using session + roll and verifies registration number in browser code (`js/student.js`). This is not safe as a public table-read design; verification must move server-side and return only the authenticated student's allowed profile.
- Student dashboard directly reads attendance rows filtered by `student_id` (`js/student.js`). Client-side filtering is not an authorization boundary.
- Attendance reports directly read session attendance rows and class student lists (`js/reports.js`).
- Teacher attendance/report flows directly read student and attendance data (`js/teacher.js`).
- Attendance setup and administration directly read student/teacher data (`js/attendance.js`, `js/admin.js`, `js/people.js`).
- GPS reporting already uses the scoped `get_gps_attendance_report` RPC; keep its server-side admin/teacher checks intact.
- Student attendance submission already uses `student_mark_attendance_v4`; do not downgrade to legacy RPCs.

## Required implementation order
1. Replace student login lookup/registration verification with a server-side RPC that verifies session, roll, registration number, and active status together. It must not reveal whether a roll or registration number exists independently.
2. Replace student attendance-history direct reads with a server-side student-scoped RPC. The server must derive the student identity from a short-lived verified session/token, not trust a client-supplied student UUID.
3. Replace teacher report reads with RPCs that validate the teacher token and constrain data to assigned courses/sessions.
4. Replace admin reads/management paths with admin-checked RPCs while preserving current report fields, exports, sorting, pagination, and student-management operations.
5. Run end-to-end regression tests for Student, Teacher, Admin, live report, Attendance Reports, exports, GPS report, and bulk/manual attendance in Preview.
6. Only after the replacement paths pass, prepare a separate reviewed migration to remove PUBLIC SELECT policies and unnecessary anon/authenticated table/column grants. Do not apply it to Production without explicit approval.

## Non-goals for this P0 change
- No changes to historical attendance rows.
- No GPS retention or geofence changes.
- No broad revocation of SECURITY DEFINER RPC execution. Each RPC must be reviewed for its own token/admin authorization checks.
- No unrelated UI redesign or feature additions.

## Verification checklist
- Anonymous requests cannot read student personal data or attendance records.
- A student can see only their own attendance history and profile.
- A teacher can see only assigned/authorized class and course data.
- An administrator retains the current report and management capabilities.
- No existing attendance submission workflow regresses.
- Database row counts and historical attendance records remain unchanged.
