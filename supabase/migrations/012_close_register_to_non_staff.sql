-- 012 — The register is for staff, not for anyone who can sign up.
--
-- WHY
-- 002 granted SELECT on `students` and `staff` with `using (true)`. Read that
-- as "any authenticated user", not "any staff member" — the two are the same
-- thing only while auth accounts are created by hand in the dashboard.
--
-- This project has `disable_signup: false`. Anyone on the internet can POST to
-- /auth/v1/signup with an address they own, click the confirmation link, and
-- hold a token whose role is `authenticated`. Under `using (true)` that token
-- reads all 415 students — name, admission number, grade, section, boarding
-- status, roll number — and the whole staff table, which `select *` means
-- every colleague's email and phone.
--
-- Nothing had to go wrong for that to be true. It is the state today.
--
-- 005 already had this right: `using (my_staff_id() is not null)` on duties and
-- attendance, which is why the marks were never exposed by the same route.
-- This applies the same test to the two tables that were left open.
--
-- WHAT DOES NOT CHANGE
-- Every current user has a `staff` row, so every current user still reads
-- exactly what they read before. This removes access from accounts that have
-- no staff row at all — which today means accounts nobody at the school
-- created.
--
-- DELIBERATELY NOT IN THIS FILE
--   * `active` is not tested. A deactivated staff member keeps their staff row
--     (D3: flag, never delete), so `my_staff_id()` still finds it and they can
--     still read. That is a real gap and a separate decision — tightening it
--     here would lock out anyone whose row is already flagged, mid-pilot,
--     with no warning. See the note at the foot of this file.
--   * `checkpoints` and `status_types` keep `using (true)`. They are timetable
--     configuration, not personal data, and a hotfix should touch what is
--     actually bleeding.
--   * Column-level access. A teacher can still read a colleague's phone
--     number, because RLS filters rows, not columns. Restricting that needs
--     GRANT, and it is a policy question for the school, not a leak.

-- ── STUDENTS ────────────────────────────────────────────────────────────────
drop policy if exists students_read_all on students;

create policy students_read_all on students
  for select to authenticated
  using (my_staff_id() is not null);

-- ── STAFF ───────────────────────────────────────────────────────────────────
-- The directory stays readable to staff: "who owns this duty", "reassign to…"
-- and the Staff tab all need it, and 005 already assumes it.
drop policy if exists staff_read_all on staff;

create policy staff_read_all on staff
  for select to authenticated
  using (my_staff_id() is not null);

-- ── VERIFY, BOTH DIRECTIONS, BEFORE TRUSTING THIS ───────────────────────────
-- The positive case is the one that breaks the pilot if this is wrong, so
-- check it first, with a real teacher's token:
--
--   1. GET /rest/v1/students?select=name&limit=1   -> one row      (NOT [])
--   2. GET /rest/v1/staff?select=name&limit=1      -> one row      (NOT [])
--   3. Open the app and load Roster                -> 415 students
--
-- The negative case needs a token with no staff row. Make one, then remove it:
--
--   4. Sign up a throwaway address, confirm it, and with THAT token:
--        GET /rest/v1/students?select=name&limit=1 -> []
--        GET /rest/v1/staff?select=name&limit=1    -> []
--      `[]` is the pass. A row means this file did not take effect.
--   5. Delete that user in Authentication → Users.
--
-- If step 1 or 2 returns [] for a real teacher, roll back immediately with:
--   drop policy if exists students_read_all on students;
--   create policy students_read_all on students
--     for select to authenticated using (true);
--   drop policy if exists staff_read_all on staff;
--   create policy staff_read_all on staff
--     for select to authenticated using (true);
-- ...and say so, because it means `my_staff_id()` is not resolving and the
-- cause is `staff.auth_user_id` being unset, not this policy.

-- ── STILL OPEN AFTER THIS ───────────────────────────────────────────────────
-- A staff member whose row is `active = false` can still sign in and read
-- everything: `fetchStaffByEmail` in src/lib/staff.js does not filter on
-- `active` either. Deactivation currently removes someone from lists without
-- removing their access. Worth its own migration, alongside a decision about
-- what should happen to their auth user when they leave.
