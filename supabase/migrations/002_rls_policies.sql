-- 002_rls_policies.sql
-- Row-Level Security. This app holds personal data of minors, so per SRS §14
-- access control is enforced by the DATABASE, not by hiding buttons in the UI.
-- A teacher's token must be unable to read another class's data even when
-- queried directly from a console.
--
-- TESTING: after applying this, exercise every policy with a real user token —
-- confirm the allowed action succeeds AND the forbidden one fails. Two bugs
-- reached the running app because the SQL read correctly and was never run.

alter table staff        enable row level security;
alter table students     enable row level security;
alter table checkpoints  enable row level security;
alter table status_types enable row level security;
alter table duties       enable row level security;
alter table attendance   enable row level security;

-- Helper: the caller's own staff row. SECURITY DEFINER so it can read `staff`
-- without recursing through the very policies that call it.
create or replace function my_staff()
returns staff
language sql
stable
security definer
set search_path = public
as $$ select * from staff where auth_user_id = auth.uid() $$;

create or replace function my_role() returns text
language sql stable security definer set search_path = public
as $$ select role from staff where auth_user_id = auth.uid() $$;

create or replace function my_staff_id() returns text
language sql stable security definer set search_path = public
as $$ select id from staff where auth_user_id = auth.uid() $$;

-- ── STAFF ───────────────────────────────────────────────────────────────────
drop policy if exists staff_read_all    on staff;
drop policy if exists staff_update_own  on staff;
drop policy if exists staff_write_admin on staff;

-- Everyone signed in can see the directory (names and roles).
create policy staff_read_all on staff
  for select to authenticated using (true);

-- A user may edit their OWN row — but the WITH CHECK pins role and email to
-- their current values. Without it, a teacher could set role='admin' in the
-- same statement that updates their phone number.
create policy staff_update_own on staff
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and role  = (select role  from staff where auth_user_id = auth.uid())
    and email = (select email from staff where auth_user_id = auth.uid())
  );

create policy staff_write_admin on staff
  for all to authenticated
  using (my_role() = 'admin')
  with check (my_role() = 'admin');

-- ── STUDENTS ────────────────────────────────────────────────────────────────
drop policy if exists students_read_all on students;
drop policy if exists students_write    on students;

create policy students_read_all on students
  for select to authenticated using (true);

create policy students_write on students
  for all to authenticated
  using (my_role() in ('coordinator','admin'))
  with check (my_role() in ('coordinator','admin'));

-- ── REFERENCE TABLES ────────────────────────────────────────────────────────
drop policy if exists checkpoints_read       on checkpoints;
drop policy if exists checkpoints_write_admin on checkpoints;
drop policy if exists status_types_read      on status_types;
drop policy if exists status_types_write_admin on status_types;

create policy checkpoints_read on checkpoints
  for select to authenticated using (true);
create policy checkpoints_write_admin on checkpoints
  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

create policy status_types_read on status_types
  for select to authenticated using (true);
create policy status_types_write_admin on status_types
  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- ── DUTIES ──────────────────────────────────────────────────────────────────
drop policy if exists duties_select on duties;
drop policy if exists duties_update on duties;
drop policy if exists duties_insert on duties;

-- A teacher sees only their own duties; oversight roles see all.
create policy duties_select on duties
  for select to authenticated
  using (staff_id = my_staff_id() or my_role() in ('coordinator','management','admin'));

-- Reassignment is a coordinator/admin action; a teacher may only touch a duty
-- already assigned to them (marking it submitted).
create policy duties_update on duties
  for update to authenticated
  using (staff_id = my_staff_id() or my_role() in ('coordinator','admin'))
  with check (staff_id = my_staff_id() or my_role() in ('coordinator','admin'));

create policy duties_insert on duties
  for insert to authenticated
  with check (my_role() in ('coordinator','admin'));

-- ── ATTENDANCE ──────────────────────────────────────────────────────────────
drop policy if exists attendance_select on attendance;
drop policy if exists attendance_insert on attendance;
drop policy if exists attendance_update on attendance;

create policy attendance_select on attendance
  for select to authenticated
  using (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.staff_id = my_staff_id() or my_role() in ('coordinator','management','admin'))
  ));

-- A teacher may write attendance only for their own duty, and only while it
-- is still pending — records are immutable once submitted (SRS A6).
-- Coordinators and admins can always correct, which is audit-logged.
create policy attendance_insert on attendance
  for insert to authenticated
  with check (exists (
    select 1 from duties d
    where d.id = duty_id
      and ((d.staff_id = my_staff_id() and d.state = 'pending')
           or my_role() in ('coordinator','admin'))
  ));

create policy attendance_update on attendance
  for update to authenticated
  using (exists (
    select 1 from duties d
    where d.id = duty_id
      and ((d.staff_id = my_staff_id() and d.state = 'pending')
           or my_role() in ('coordinator','admin'))
  ))
  with check (exists (
    select 1 from duties d
    where d.id = duty_id
      and ((d.staff_id = my_staff_id() and d.state = 'pending')
           or my_role() in ('coordinator','admin'))
  ));
