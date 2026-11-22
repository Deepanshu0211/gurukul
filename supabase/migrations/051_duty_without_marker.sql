-- 051 — A register with nobody to mark it goes to a coordinator, never fails.
--
-- THE BUG
-- Cancelling a holiday deletes its `holidays` row, and the trigger from 033
-- (`apply_holiday_change`) rebuilds that day's registers. The class registers
-- are given to the class's teacher, looked up by `staff.class_key`. A class with
-- no teacher on record — common in the mock data, possible in the real school
-- the week a teacher leaves — comes back with `staff_id` NULL, `duties.staff_id`
-- is NOT NULL, and the insert aborts. The whole cancel is rolled back, so the
-- coordinator sees "null value in column staff_id of relation duties" and the
-- holiday stays declared.
--
-- The roster generator in 036 already handles this (`coalesce(..., fallback,
-- 'c1')`), but a database still running an older builtin generator, or any
-- future code path that forgets, hits the same wall. So the rule moves to the
-- table: whoever builds a register, an unassigned one falls to a coordinator,
-- who can reassign it from the Roster. That is the rule 043 already states
-- ("a section with no teacher falls to a coordinator") — this enforces it.
--
-- Re-runnable.

create or replace function duty_default_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is null then
    new.staff_id := coalesce(
      (select id from staff where active and role = 'coordinator' order by id limit 1),
      (select id from staff where active and role = 'admin' order by id limit 1),
      (select id from staff where active order by id limit 1)
    );
  end if;
  -- Still null means the school has no active staff at all; let the NOT NULL
  -- constraint say so rather than inventing an owner.
  return new;
end;
$$;

revoke all on function duty_default_marker() from public, anon, authenticated;

drop trigger if exists duties_default_marker on duties;
create trigger duties_default_marker
  before insert or update of staff_id on duties
  for each row execute function duty_default_marker();

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- In the SQL editor, inside a transaction so nothing is kept:
--   begin;
--   insert into holidays (day, label, hostel_checkpoints) values (school_today() + 3, 'test', true);
--   delete from holidays where day = school_today() + 3;   -- must not error
--   select count(*) from duties where day = school_today() + 3 and staff_id is null;  -- 0
--   rollback;
