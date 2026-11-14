# P0 Student Access — RPC Contract and Safe Migration Sequence

Status: design only. No SQL migration is applied and no frontend behavior is changed in this commit.

## Current behavior verified in `js/student.js`
- Login selects a student profile directly from `public.students` using session plus roll/registration-number matching.
- Registration-number comparison is performed in browser JavaScript after the row has already been returned.
- Dashboard history selects `public.attendance_records` by a client-supplied `student_id`. This filter is not an authorization boundary.
- The dashboard also reads held-session data through `get_held_sessions`, public notices, and routine data. These dependencies must be retained when the direct table reads are replaced.

## Proposed server-side contract

### 1. `student_login_secure(p_session text, p_roll text, p_registration text)`
- Verify session and roll on the server.
- If the matched student has a non-empty registration number, require an exact normalized match server-side.
- Require `status = 'active'`; reject archived/inactive/TC/graduated records.
- Return the same generic failure for an unknown session/roll and a registration mismatch. Do not reveal which field matched.
- Return only the minimum profile fields required by the existing student dashboard: id, name, session, session_year, year, class_roll, status, is_irregular.
- Create a cryptographically random, short-lived student session token; store only its hash in a private table. Never return registration number, phone, guardian phone, or address.

### 2. `student_get_dashboard(p_student_token text)`
- Resolve the student identity from the hashed token and enforce expiry/revocation server-side.
- Do not accept a student UUID as an authorization input.
- Return the verified student's profile, held-session denominator, and only that student's attendance history in one scoped response.
- Apply a bounded history window/pagination so response size cannot grow without limit.
- Preserve the existing attendance calculation: count present/late records only for held sessions.
- Do not return other students' rows or private GPS coordinates.

### Token lifecycle
- Private token table: RLS enabled; revoke all direct privileges from PUBLIC/anon/authenticated.
- Store a SHA-256 digest of a high-entropy random token, not the raw token.
- Short expiry (initial proposal: 8 hours), revoke on logout, and rotate on successful login.
- Rate-limit failed login attempts by a non-sensitive key; avoid storing raw registration numbers in logs.
- Use a generic error response and avoid distinguishable timing/response paths where practical.

## Frontend integration requirements
- `studentLogin()` must call the secure login RPC and must never query `students` directly.
- Store the returned opaque token only for the active student session; clear it on logout and on expiry.
- `loadStudentData()` must call the dashboard RPC and render its response. It must never query `attendance_records` directly.
- Preserve the current routine, notice board, held-class denominator, attendance percentage, and history UI. Keep notices/routines on their existing access paths until their own policies and data requirements are audited.
- Never use the client-supplied `currentStudent.id` as proof of identity.

## Rollout / verification gates
1. PostgreSQL `pgcrypto` is installed in the `extensions` schema. Use schema-qualified `extensions.gen_random_bytes(...)` / `extensions.digest(...)` (after confirming exact function signatures) rather than relying on an implicit search path. The current `get_held_sessions(text, integer)` is SECURITY DEFINER and counts sessions with at least one present/late row; preserve that exact denominator behavior but call it only inside the student-scoped dashboard RPC. Confirm existing rate-limit helpers before implementing login throttling.
2. Add the new token table and RPCs in a migration on the feature branch only.
3. Add frontend integration behind a compatibility switch so the current flow remains available until the RPC exists in the test database.
4. Test valid login, wrong session, wrong roll, missing/wrong registration, inactive student, expired token, logout/revocation, and two students attempting to use each other's tokens.
5. Compare dashboard totals/history against current output for representative sessions, including zero-attendance and irregular students.
6. Verify no direct anonymous SELECT of student or attendance rows is possible after the final policy/grant migration.
7. Only then prepare the broader Teacher/Admin RPC migration and final read-access restriction.

## Explicitly out of scope for this step
- No production DDL, policy/grant changes, data updates, or deletions.
- No modification to existing attendance records, GPS behavior, teacher tokens, or admin workflows.
- No disabling of any currently used RPC.

## Additional production inspection (read-only, 2026-11-13)

- All 497 current student rows returned by the status check are `status = 'active'` and `is_archived = false`. This is a current snapshot, not a permanent invariant; the RPC must still check both conditions at login and token use.
- The `private` schema does not currently exist. The migration must create it explicitly and keep token storage there, with RLS enabled and no API-role grants.
- `extensions.digest(bytea,text)` and `extensions.gen_random_bytes(integer)` are present. Token generation can use 32 random bytes and SHA-256 hashing with schema-qualified functions.
- Existing `public.login_attempts`, `public._lock_remaining(text)`, and `public._register_failure(text,integer,interval,interval)` provide a reusable lockout mechanism. `teacher_login` currently uses a 5-failure / 15-minute window / 5-minute lock. Student login should use a separate key namespace (for example, a keyed digest of normalized session + roll) and the same helpers only after verifying their current ACLs and behavior. Never put registration numbers in the key or logs.
- `login_attempts` has RLS enabled and no policies; its table grants are limited to postgres/service_role in the inspected grant view. Keep it server-side.
- The current held-session denominator is exactly the set of sessions for the same year and session_year having at least one attendance row with status present or late. The secure dashboard RPC must preserve this definition; it must not change attendance calculation rules.

## Implementation gate — do not bypass

The live Supabase project inspected so far is Production. The repository branch is isolated, but it is not a separate database. No migration or RPC can be meaningfully end-to-end tested against a disposable database without provisioning a Supabase development branch or another test project. Do not apply this migration to Production as a substitute for testing.

Before implementation, provision an isolated Supabase development database (and confirm any usage/cost implications), then create the migration through the Supabase CLI workflow. Test the RPCs and frontend against that isolated database before preparing any Production rollout. The student dashboard must also retain its current exam schedule, routines, notices, and course-label dependencies.
