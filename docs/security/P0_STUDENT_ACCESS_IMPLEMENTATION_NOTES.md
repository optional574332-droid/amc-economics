# P0 Student Read-Access Hardening — Implementation Notes

Date: 2026-11-14
Branch: `security/p0-read-access-hardening`

## Implemented on this branch only

1. Added `supabase/migrations/20261114100000_secure_student_read_access.sql`.
   - Creates a private student-token table with RLS enabled and no direct API-role table privileges.
   - Stores SHA-256 token hashes only; raw 256-bit tokens are returned once at login.
   - Adds an 8-hour token expiry, revocation, token rotation on successful login, and cleanup of old token metadata.
   - Adds server-side session/roll/registration validation, active/not-archived checks, generic login failures, and the existing server-side login lockout helpers with a separate hashed key namespace.
   - Adds self-scoped dashboard data: exact held-session denominator, total attended count, and at most 100 recent history rows. GPS coordinates and other students' records are not returned.
   - Public PostgREST functions are SECURITY INVOKER wrappers; the narrowly scoped private implementation functions are SECURITY DEFINER with an empty search_path and schema-qualified object references.

2. Updated `js/student.js`.
   - Student login now calls `student_login_secure`; it no longer reads `students` directly.
   - Dashboard now calls `student_get_dashboard`; it no longer reads `attendance_records` directly.
   - Keeps routine, notice board, exam schedule, attendance percentage, and attendance history UI.
   - Keeps the raw student token in page memory only; it is not written to localStorage or sessionStorage.

3. Updated `js/auth.js`.
   - Attempts server-side token revocation on logout and clears the in-memory token.

## Static review performed

- Confirmed the updated `js/student.js` has no direct `students` or `attendance_records` table query.
- Confirmed login, dashboard, and logout RPC names match the migration.
- Confirmed the current student exam schedule is still loaded through the existing `get_student_exam_schedule` RPC.
- Reviewed the Production schema/function definitions read-only to align the migration with the current column names, pgcrypto schema, and existing login lockout helper signatures.
- No Production SQL was executed to create or alter schema objects.

## Important verification limitation

At the user's direction, no Local Supabase/Docker environment will be provisioned and no end-to-end database test will be run at this stage. Therefore:
- This is a code/migration draft with static review only, not a runtime-verified fix.
- Do not merge to `main`, deploy, or apply the migration to Production yet.
- Do not remove the existing public SELECT policies/grants on `students` or `attendance_records` in this step. Teacher/Admin/Reports and other frontend paths still have direct dependencies and require their own staged replacement.
- Before any Production rollout, the migration must be reviewed against the exact live schema and tested in a disposable database or through a separately approved controlled rollout plan. A Production migration is not a test.

## Data-safety boundary

No attendance records, student records, GPS records, teacher tokens, or existing Production policies/grants were modified by this branch work. No PR was opened, no merge was performed, and no deployment was triggered.
