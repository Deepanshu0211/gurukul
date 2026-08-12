-- 005 — Cover marking: any teacher may mark any checkpoint.
--
-- WHY
-- The pilot rule was "a teacher sees only their own duties" (002). In practice
-- a duty teacher is regularly away — sick, on escort duty, at a festival — and
-- the checkpoint still has to be marked within its window or it escalates to
-- the Principal. Waiting for a coordinator to reassign the duty first is the
-- thing that makes a checkpoint late.
--
-- WHAT CHANGES
-- Every active staff member can now read every duty and its attendance, and
-- can submit any duty that is still pending. The duty's assignment does not
-- change: `staff_id` stays with the original teacher, and `submitted_by`
-- records who actually did it — so "Sita marked Krishna's Breakfast" is
-- visible in the data rather than hidden behind a reassignment.
--
-- WHAT DOES NOT CHANGE
--  * Reassigning a duty (changing `staff_id`) stays coordinator/admin only,
--    now enforced by a trigger — RLS alone cannot tell which column an UPDATE
--    touched, so the old policy would have let a covering teacher take a duty
--    off its owner.
--  * A submitted duty stays locked to everyone except coordinator/admin.
--  * Students, staff and the audit log are untouched.
--
-- TRADE-OFF, STATED PLAINLY
-- This makes attendance data school-wide readable by any staff login. That is
-- a deliberate widening of 002's teacher isolation, chosen for operational
-- cover. Roles below staff (none today) must never be granted `authenticated`
-- without revisiting this file.

-- ── DUTIES ──────────────────────────────────────────────────────────────────
drop policy if exists duties_select on duties;
drop policy if exists duties_update on duties;

-- Any staff member can see the whole day's roster.
create policy duties_select on duties
  for select to authenticated
  using (my_staff_id() is not null);

-- Any staff member may update a duty that is still pending (that is: submit
-- it). Once submitted only a coordinator/admin can touch it again.
create policy duties_update on duties
  for update to authenticated
  using (state = 'pending' or my_role() in ('coordinator','admin'))
  with check (my_staff_id() is not null);

-- Assignment stays a coordinator/admin action. RLS sees only the finished row,
-- so the "did staff_id change?" question needs a trigger.
create or replace function guard_duty_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is distinct from old.staff_id
     and my_role() not in ('coordinator','admin') then
    raise exception 'Only a coordinator can reassign a duty'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists duties_guard_reassignment on duties;
create trigger duties_guard_reassignment
  before update on duties
  for each row execute function guard_duty_reassignment();

-- ── ATTENDANCE ──────────────────────────────────────────────────────────────
drop policy if exists attendance_select on attendance;
drop policy if exists attendance_insert on attendance;
drop policy if exists attendance_update on attendance;

create policy attendance_select on attendance
  for select to authenticated
  using (my_staff_id() is not null);

-- Writable while the duty is pending, by anyone covering it. Records stay
-- immutable once submitted (SRS A6) — coordinators and admins correct, and
-- that correction is audit-logged.
create policy attendance_insert on attendance
  for insert to authenticated
  with check (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.state = 'pending' or my_role() in ('coordinator','admin'))
  ));

create policy attendance_update on attendance
  for update to authenticated
  using (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.state = 'pending' or my_role() in ('coordinator','admin'))
  ))
  with check (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.state = 'pending' or my_role() in ('coordinator','admin'))
  ));

-- ── VERIFY BY HAND BEFORE THE PILOT ─────────────────────────────────────────
-- With a plain teacher token:
--   1. select from duties            -> returns the whole day, not just theirs
--   2. submit a colleague's pending duty  -> succeeds
--   3. update duties set staff_id = … -> fails, 42501
--   4. write attendance for a duty already submitted -> fails
