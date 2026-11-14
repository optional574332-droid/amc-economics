# P0 Deployment Runbook (safe order)

Principle: existing Production data is never inserted/updated/deleted by any step.

## Phase 1 - additive database functions (ALREADY APPLIED to Production on 14 Nov 2026)
Migrations 20261114100000 ... 20261114165000 (new functions + private.student_access_tokens only).
Old frontend (main) ignores them. Verified on real data with rolled-back tests.

## Phase 2 - deploy frontend
Merge security/p0-read-access-hardening into main (Vercel deploys it).
Test: Student login + dashboard; PIN attendance (type a roll); Teacher: PIN, Manual, Bulk list,
Marks entry list, Live report, Reports, Device tracking, Routine viewer teacher filter, Faculty directory; Admin tabs.

## Phase 3 - lockdown (ONLY after Phase 2 tests pass)
Apply 20261114180000_p0_phase3_lockdown.sql.
If anything breaks: run supabase/rollback/phase3_rollback.sql (restores exact previous state).
Then hard-refresh the app once (service worker cache is v16).

## Known accepted risks (owner decision, unchanged)
- PIN-based class roster / PIN guessing, department-wide read of today's session roster.
- Students without registration number log in with session + roll only.
