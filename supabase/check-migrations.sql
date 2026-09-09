-- What actually exists in this database right now.
--
-- Paste the whole file into the Supabase SQL Editor and run it. It changes
-- nothing — every statement is a read, except the last line, which asks
-- PostgREST to re-read the schema (harmless, and the fix if the objects below
-- all say "yes" but the app still cannot see them).
--
-- Send back the four result grids.
--
-- WHY THIS FILE AND NOT A PROBE FROM THE APP
-- An anon or authenticated key cannot ask PostgREST what exists: the OpenAPI
-- endpoint is service_role only, and calling a function to see whether it is
-- there either fails for the wrong reason (a function with required arguments
-- 404s exactly like one that does not exist) or succeeds for the worst reason
-- — `submit_duty` and `approve_staff_request` WRITE. `to_regprocedure` asks
-- the catalogue directly and calls nothing.

-- ── 1. Did each migration's objects get created? ────────────────────────────
-- A migration is applied when every object on its row exists. Ordered so the
-- first "false" going down the list is where to resume.
select object, exists from (values
  ('001 students table',        to_regclass('public.students')                                  is not null),
  ('001 staff table',           to_regclass('public.staff')                                     is not null),
  ('001 duties table',          to_regclass('public.duties')                                    is not null),
  ('001 attendance table',      to_regclass('public.attendance')                                is not null),
  ('001 checkpoints table',     to_regclass('public.checkpoints')                               is not null),
  ('001 status_types table',    to_regclass('public.status_types')                              is not null),
  ('002 my_staff_id()',         to_regprocedure('public.my_staff_id()')                         is not null),
  ('002 my_role()',             to_regprocedure('public.my_role()')                             is not null),
  ('003 avatars bucket',        exists(select 1 from storage.buckets where id = 'avatars')),
  ('004 my_class_key()',        to_regprocedure('public.my_class_key()')                         is not null),
  ('006 audit_log',             to_regclass('public.audit_log')                                 is not null),
  ('006 can_override()',        to_regprocedure('public.can_override()')                        is not null),
  ('008 alert_resolutions',     to_regclass('public.alert_resolutions')                         is not null),
  ('009 attendance_detail',     to_regclass('public.attendance_detail')                         is not null),
  ('009 student_attendance',    to_regprocedure('public.student_attendance(text,date,date)')    is not null),
  ('010 submit_duty',           to_regprocedure('public.submit_duty(text,jsonb)')               is not null),
  ('011 attendance_headcount',  to_regprocedure('public.attendance_headcount(date,date)')       is not null),
  ('013 staff_requests table',  to_regclass('public.staff_requests')                            is not null),
  ('013 reject_staff_request',  to_regprocedure('public.reject_staff_request(uuid,text)')       is not null),
  ('013 staff_id_seq',          to_regclass('public.staff_id_seq')                              is not null),
  ('014 submit_access_request', to_regprocedure('public.submit_access_request(text,text,text)') is not null),
  ('014 link_staff_account',    to_regprocedure('public.link_staff_account()')                  is not null),
  ('016 approve_staff_request', to_regprocedure('public.approve_staff_request(uuid,text)')      is not null),
  ('017 houses table',          to_regclass('public.houses')                                    is not null),
  ('017 students.house',        exists(select 1 from information_schema.columns
                                        where table_schema='public' and table_name='students'  and column_name='house')),
  ('017 saturday_report',       to_regprocedure('public.saturday_report(date,text)')            is not null),
  ('018 duties.band',           exists(select 1 from information_schema.columns
                                        where table_schema='public' and table_name='duties'    and column_name='band')),
  ('019 duties.house',          exists(select 1 from information_schema.columns
                                        where table_schema='public' and table_name='duties'    and column_name='house')),
  ('020 class_status_board',    to_regprocedure('public.class_status_board(date,text)')         is not null)
) as t(object, exists);

-- ── 2. Did 012 and 015 tighten the policies? ────────────────────────────────
-- 012: both clauses must read `(my_staff_id() IS NOT NULL)`. If either still
-- reads `true`, the student register is readable by any account that can sign
-- up — including one that has not been approved as staff.
select tablename, policyname, qual as using_clause
from pg_policies
where schemaname = 'public'
  and policyname in ('students_read_all', 'staff_read_all')
order by tablename;

-- ── 3. What is actually in the register? ────────────────────────────────────
-- Which seeds have been run, and whether the register is the 415-row sample,
-- the 411-row mock school, or something half-replaced.
select 'students' as what, count(*)::text as n from students
union all select 'classes',        count(distinct grade || '|' || section)::text from students
union all select 'grade range',    min(grade)::text || '-' || max(grade)::text from students
union all select 'residential',    count(*)::text from students where stype <> 'Day Scholar'
union all select 'with a house',   count(*)::text from students where house is not null
union all select 'staff',          count(*)::text from staff
union all select 'staff w/ login', count(*)::text from staff where auth_user_id is not null
union all select 'class teachers', count(*)::text from staff where class_key is not null
union all select 'duties',         count(*)::text from duties
union all select 'duties today',   count(*)::text from duties where day = current_date
union all select 'attendance',     count(*)::text from attendance
union all select 'checkpoints',    count(*)::text from checkpoints
union all select 'status types',   count(*)::text from status_types
union all select 'houses',         count(*)::text from houses;

-- ── 4. Can every staff row actually sign in? ────────────────────────────────
-- A staff row whose email has no Auth user is refused at the login screen with
-- "incorrect email or password", which reads as a wrong password rather than a
-- missing account. An Auth user with no `identities` row does the same thing:
-- GoTrue matches a password against the identity, not the user.
select s.id, s.name, s.email,
       (u.id is not null)                     as has_auth_user,
       (i.user_id is not null)                as has_identity,
       (s.auth_user_id is not null)           as linked
from staff s
left join auth.users u      on lower(u.email) = lower(s.email)
left join auth.identities i on i.user_id = u.id and i.provider = 'email'
order by (u.id is null) desc, (i.user_id is null) desc, s.id;

-- ── 5. Nudge PostgREST to re-read the schema ────────────────────────────────
-- Only matters if section 1 says the objects exist but the app still reports
-- "Could not find the function … in the schema cache".
notify pgrst, 'reload schema';
