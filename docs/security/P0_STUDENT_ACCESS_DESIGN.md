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
1. Confirm PostgreSQL crypto extension schema and availability, existing rate-limit helpers, and all `get_held_sessions` semantics.
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
