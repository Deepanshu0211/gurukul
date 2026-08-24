-- What actually exists in this database right now.
--
-- Paste the whole file into the Supabase SQL Editor and run it. It changes
-- nothing — every statement is a read, except the last line, which asks
-- PostgREST to re-read the schema (harmless, and the fix if the objects below
-- all say "yes" but the app still cannot see them).
--
-- Send back the two result grids.

-- ── 1. Did each migration's objects get created? ────────────────────────────
select
  '011 attendance_headcount'  as object,
  to_regprocedure('public.attendance_headcount(date,date)')      is not null as exists
union all select
  '013 staff_requests table',
  to_regclass('public.staff_requests')                            is not null
union all select
  '013 reject_staff_request',
  to_regprocedure('public.reject_staff_request(uuid,text)')       is not null
union all select
  '013 staff_id_seq',
  to_regclass('public.staff_id_seq')                              is not null
union all select
  '013/014 approve_staff_request',
  to_regprocedure('public.approve_staff_request(uuid)')           is not null
union all select
  '014 submit_access_request',
  to_regprocedure('public.submit_access_request(text,text,text)') is not null
union all select
  '014 link_staff_account',
  to_regprocedure('public.link_staff_account()')                  is not null
order by object;

-- ── 2. Did 012 tighten the two open policies? ───────────────────────────────
-- Expected after 012: both read `(my_staff_id() IS NOT NULL)`.
-- If either still reads `true`, 012 has not been applied and the student
-- register is readable by any account that can sign up.
select
  tablename,
  policyname,
  qual as using_clause
from pg_policies
where schemaname = 'public'
  and policyname in ('students_read_all', 'staff_read_all')
order by tablename;

-- ── 3. Nudge PostgREST to re-read the schema ────────────────────────────────
-- Only matters if section 1 says the objects exist but the app still reports
-- "Could not find the function … in the schema cache".
notify pgrst, 'reload schema';
