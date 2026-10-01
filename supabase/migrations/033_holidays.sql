-- 033 — A declared holiday, and a day that knows not to ask for a register.
--
-- THE GAP THIS CLOSES
-- `generate_duties()` (024/028) builds the same twenty-odd checkpoints every
-- single day, seven days a week, forever. There is no such thing as a day off
-- in this database. So on Diwali the nightly job still creates a morning
-- register for every class in the school, the reminder job still chases a
-- teacher who is four hundred kilometres away, and at 10:30pm the Principal
-- gets an escalation for every checkpoint in the building.
--
-- A school with a working escalation ladder and no concept of a holiday sends
-- the Principal about forty emails on the first day of the winter break. The
-- second consequence is worse than the first: people learn to ignore it, and
-- the one alert that means a child is actually missing arrives in a folder
-- nobody reads any more.
--
-- TWO KINDS OF HOLIDAY, AND WHY IT IS A CHOICE
-- This is a residential school. "No school today" and "no children on campus
-- today" are not the same sentence, and treating them as one is how the safety
-- net gets switched off on exactly the day it matters.
--
--   hostel_checkpoints = true   Classes are off. The boarders are still here,
--                               so Mangalarati, prasadam and night attendance
--                               still run and are still marked. This is an
--                               exam break, a local festival, a Sunday.
--
--   hostel_checkpoints = false  The school is genuinely closed and the hostel
--                               is empty. Nothing is generated and nothing is
--                               marked. This is the winter break.
--
-- The declarer chooses. There is no safe default that can be inferred from a
-- date, so the app asks, in those words, every time.
--
-- WHO MAY DECLARE ONE
-- Coordinator and admin. Not management, and deliberately so — for the same
-- reason `canApproveStaff` excludes them in domain/roles.js: the MOD reads the
-- board, they do not set the school's calendar. Not a teacher, obviously: a
-- holiday cancels other people's duties.

-- ── THE TABLE ───────────────────────────────────────────────────────────────
-- One row per day, keyed by the day itself. A holiday that spans a week is
-- seven rows, inserted together by the app.
--
-- Deliberately NOT a (from, to) range. Every question this table is ever asked
-- is "is THIS day a holiday?" — from the generator, from the reminder job,
-- from a screen showing one day. A range makes every one of those a containment
-- query with an open-ended end, and makes "cancel Thursday out of the middle of
-- the break" a row split. A primary key on the date makes all of it a lookup.
create table if not exists holidays (
  day                date primary key,
  label              text not null,
  -- See above. NOT defaulted to a guess: the app always sends it explicitly.
  hostel_checkpoints boolean not null default true,
  note               text,
  declared_by        text references staff(id),
  declared_at        timestamptz not null default now()
);

comment on table holidays is
  'Days the school does not take class attendance. hostel_checkpoints=true '
  'means the boarders are still on campus and the residential checkpoints '
  'still run; false means the campus is empty and nothing is marked.';

-- ── WHO SAYS SO ─────────────────────────────────────────────────────────────
-- `declared_by` is stamped by the database from the caller's own token, never
-- accepted from the client — the same rule `submit_duty` follows for
-- `submitted_by` (migration 010). A holiday cancels other people's work; the
-- name beside it has to be the name of whoever actually pressed the button.
create or replace function stamp_holiday_declarer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.declared_by := my_staff_id();
  new.declared_at := now();
  return new;
end;
$$;

drop trigger if exists holidays_stamp_declarer on holidays;
create trigger holidays_stamp_declarer
  before insert or update on holidays
  for each row execute function stamp_holiday_declarer();

-- ── READING ONE ─────────────────────────────────────────────────────────────
-- `stable security definer`, so the generator and the duty guard below can ask
-- the question without RLS in the way, and so a caller with no staff row still
-- gets a truthful answer rather than a silent "no holiday".
create or replace function holiday_on(p_day date)
returns holidays
language sql
stable
security definer
set search_path = public
as $$ select * from holidays where day = p_day $$;

grant execute on function holiday_on(date) to authenticated;

-- Does the CLASS register run on this day? False on any holiday.
create or replace function classes_run_on(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select not exists (select 1 from holidays where day = p_day) $$;

-- Do the RESIDENTIAL checkpoints run? True unless the campus is closed.
create or replace function hostel_runs_on(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select hostel_checkpoints from holidays where day = p_day),
    true
  );
$$;

grant execute on function classes_run_on(date) to authenticated;
grant execute on function hostel_runs_on(date) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table holidays enable row level security;

drop policy if exists holidays_read  on holidays;
drop policy if exists holidays_write on holidays;

-- Everybody signed in can see the calendar. A teacher needs to know why their
-- Duties tab is empty, and "Diwali — declared by the coordinator" is the
-- answer; without the read they would see the same blank screen that a failed
-- generation produces, which is the one thing worth never confusing.
create policy holidays_read on holidays
  for select to authenticated using (true);

-- Note both USING and WITH CHECK. Without WITH CHECK, `for all` leaves INSERT
-- unguarded entirely — an INSERT has no existing row for USING to test, so the
-- policy would let any signed-in teacher declare a school holiday. This is the
-- exact shape of the `staff_update_own` bug noted in CLAUDE.md §5.1.
create policy holidays_write on holidays
  for all to authenticated
  using      (coalesce(my_role(), '') in ('coordinator', 'admin'))
  with check (coalesce(my_role(), '') in ('coordinator', 'admin'));

-- ── THE GENERATOR, TAUGHT ABOUT DAYS OFF ────────────────────────────────────
-- This is 024's function with a holiday check at the top and a DELETE of the
-- checkpoints that should not exist. Replaced whole rather than patched,
-- because the change is structural: the function now has three outcomes
-- instead of one.
--
-- The delete is what makes declaring a holiday on Tuesday for Wednesday work
-- at all. The nightly job has already built tomorrow by then (028), so the
-- duties exist before anyone decides the day is off, and a generator that only
-- ever inserts would leave them standing.
--
-- state = 'pending' ONLY. A submitted register is never deleted by anything in
-- this file. If a checkpoint was genuinely marked before somebody declared the
-- day a holiday, that record is a fact about the school and stays; the holiday
-- stops the remaining ones being asked for. The alternative — deleting a
-- submitted duty — would cascade into its attendance rows and quietly destroy
-- a morning's roll call to tidy up a calendar.
create or replace function generate_duties(p_day date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d       date    := coalesce(p_day, school_today());
  stamp   text    := to_char(d, 'YYYYMMDD');
  classes boolean := classes_run_on(d);
  hostel  boolean := hostel_runs_on(d);
  n       int;
begin
  -- ── Withdraw what the day no longer needs ────────────────────────────────
  -- Attendance first: `attendance.duty_id` references `duties(id)` with no
  -- cascade, so deleting a duty that somehow collected marks would fail on the
  -- foreign key and abort the whole generation. A pending duty should have no
  -- marks — `submit_duty` writes the marks and flips the state in one
  -- transaction (010) — but "should have none" is not a thing to bet the
  -- nightly job on.
  delete from attendance a
   using duties dd
   where a.duty_id = dd.id
     and dd.day    = d
     and dd.state  = 'pending'
     and (not classes or dd.class_key is null)
     and (not hostel  or dd.class_key is not null);

  delete from duties dd
   where dd.day   = d
     and dd.state = 'pending'
     -- When classes are off, the class registers go.
     and (not classes or dd.class_key is null)
     -- When the campus is closed, the residential checkpoints go too. Written
     -- as two conditions rather than one so a full holiday removes both sets
     -- and a classes-only holiday removes exactly one.
     and (not hostel or dd.class_key is not null);

  if not classes and not hostel then
    -- Campus closed. Nothing to build, and nothing left standing.
    return 0;
  end if;

  if classes then
    -- One morning duty per class in the register, rostered to that class's
    -- teacher. Driven off `staff.class_key`, so a class that changes hands is
    -- rostered correctly tomorrow with nothing to edit here.
    --
    -- The id carries the date. The primary key is the id alone, so a date-less
    -- id belongs to exactly one day: re-running tomorrow would MOVE yesterday's
    -- duty and drag its attendance rows with it, quietly turning yesterday's
    -- register into today's.
    insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
    select
      'morn-' || replace(k.class_key, '|', '-') || '-' || stamp,
      'morning',
      d,
      case when split_part(k.class_key, '|', 2) = 'A'
           then 'Class ' || split_part(k.class_key, '|', 1)
           else 'Class ' || split_part(k.class_key, '|', 1) || ' ' ||
                initcap(lower(split_part(k.class_key, '|', 2)))
      end,
      k.class_key,
      null, null, null,
      t.id
    from (select distinct grade || '|' || section as class_key from students where active) k
    left join lateral (
      -- min(id) so two staff sharing a class key cannot produce two duties for
      -- one class, which would double every count that class appears in.
      select min(id) as id from staff where class_key = k.class_key
    ) t on true
    on conflict (id) do update
      set group_label = excluded.group_label,
          class_key   = excluded.class_key,
          -- Deliberately NOT resetting state or submitted_at. A coordinator who
          -- reruns this at 9am must not wipe the registers already filed.
          staff_id    = coalesce(duties.staff_id, excluded.staff_id);
  end if;

  if hostel then
    -- The school-wide and band checkpoints.
    --
    -- Lunch is the one that changes shape on a holiday. On a working day it is
    -- 'Whole school', scope 'all', because the day scholars are here and eat
    -- here. On a classes-off holiday they are at home and are not the school's
    -- to account for, so counting them would produce a lunch register with
    -- ninety children missing and a corresponding pile of absences — every one
    -- of them a safety alert about a child who is safely at their own kitchen
    -- table. Narrowed to residential, and the label says so.
    insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
    select v.id || '-' || stamp, v.cp, d,
           case when not classes and v.scope = 'all' then 'All residential students'
                else v.label end,
           case when not classes and v.scope = 'all' then 'res' else v.scope end,
           v.band, null,
           coalesce((select id from staff where id = v.staff), 'c1')
    from (values
      ('mang',      'mang',      'All residential students', 'res', null,      'c1'),
      ('bfast-pri', 'breakfast', 'Primary · residential',    'res', 'Primary', 'd1'),
      ('bfast-mid', 'breakfast', 'Middle · residential',     'res', 'Middle',  'd2'),
      ('bfast-sr',  'breakfast', 'Senior · residential',     'res', 'Senior',  'd3'),
      ('lunch-all', 'lunch',     'Whole school',             'all', null,      'c1'),
      ('night-res', 'night',     'All residential students', 'res', null,      'c2')
    ) as v(id, cp, label, scope, band, staff)
    on conflict (id) do update
      set group_label = excluded.group_label,
          scope       = excluded.scope,
          band        = excluded.band,
          staff_id    = coalesce(duties.staff_id, excluded.staff_id);
  end if;

  select count(*) into n from duties where day = d;
  return n;
end;
$$;

revoke all on function generate_duties(date) from public;
grant execute on function generate_duties(date) to authenticated;

comment on function generate_duties(date) is
  'Creates the day''s checkpoints from the register, honouring `holidays`. '
  'Idempotent: never resets or deletes a submitted duty. Runs nightly from '
  'cron job generate-duties-nightly.';

-- ── DECLARING ONE TAKES EFFECT IMMEDIATELY ──────────────────────────────────
-- Without this, a holiday declared at 4pm for tomorrow does nothing until the
-- 00:30 job, and a holiday declared for TODAY does nothing at all — today's
-- job has already run and the next one builds a different day. The coordinator
-- would press the button, see the duties still sitting there, and reasonably
-- conclude it had not worked.
--
-- `after` rather than `before`: the generator reads `holidays`, so it has to
-- run once the row is actually there. Statement-level would be enough for the
-- single-day case, but the app inserts a week at a time and each day needs its
-- own regeneration.
create or replace function apply_holiday_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Branching on TG_OP rather than `coalesce(new.day, old.day)`. In a
  -- row-level DELETE trigger NEW is not assigned, and PL/pgSQL raises
  -- "record new is not assigned yet" on the field access — inside `coalesce`,
  -- before it ever gets to consider OLD. Cancelling a holiday would have
  -- failed with a message about a record variable.
  if tg_op = 'DELETE' then
    -- The day goes back to being an ordinary school day, and the same
    -- function rebuilds what it previously withdrew. That is the whole
    -- "cancel a holiday" path: remove the row, and the registers come back.
    perform generate_duties(old.day);
  else
    perform generate_duties(new.day);
    -- An UPDATE that MOVES a holiday — the break shifts by a day — leaves the
    -- day it moved off still missing its checkpoints, because nothing has
    -- asked that day to rebuild. Rebuild it too.
    if tg_op = 'UPDATE' and old.day is distinct from new.day then
      perform generate_duties(old.day);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists holidays_apply on holidays;
create trigger holidays_apply
  after insert or update or delete on holidays
  for each row execute function apply_holiday_change();

-- ── AND NOTHING SLIPS THROUGH ───────────────────────────────────────────────
-- The deletes above are the practical mechanism; this is the guarantee.
--
-- A duty can be open on a teacher's phone when the holiday is declared. The
-- row is gone from the database but the marks are still in front of her, and
-- pressing Submit would write a register for a day the school has said it is
-- not taking one — against a duty id that no longer exists, so it would fail
-- with "that duty no longer exists" and she would have no idea why.
--
-- Guarding the state transition instead means the refusal says what happened.
--
-- ONLY pending -> submitted. A correction to an already-submitted register is
-- deliberately still allowed: if a checkpoint really was marked before the day
-- was declared off, that record exists and someone must be able to fix a
-- mistake in it. Declaring a holiday does not freeze history.
create or replace function guard_holiday_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h holidays;
begin
  if old.state = 'pending' and new.state = 'submitted' then
    h := holiday_on(new.day);
    if h.day is not null and (not h.hostel_checkpoints or new.class_key is not null) then
      raise exception '% is a declared holiday (%). This checkpoint is not being taken.',
        to_char(new.day, 'FMDay DD FMMonth'), h.label
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists duties_guard_holiday on duties;
create trigger duties_guard_holiday
  before update on duties
  for each row execute function guard_holiday_submission();

-- errcode 42501 so `describeError` in src/lib/errors.js classifies it as a
-- permission refusal and shows the message above rather than a raw Postgres
-- string.

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- As a COORDINATOR:
--   insert into holidays (day, label, hostel_checkpoints)
--   values (school_today() + 1, 'Exam break', true);
--   select group_label, class_key from duties where day = school_today() + 1;
--   -> the six residential checkpoints, no class registers, lunch narrowed to
--      'All residential students' with scope 'res'
--
--   update holidays set hostel_checkpoints = false where day = school_today() + 1;
--   select count(*) from duties where day = school_today() + 1;   -> 0
--
--   delete from holidays where day = school_today() + 1;
--   select count(*) from duties where day = school_today() + 1;   -> back to 24
--
-- As a TEACHER — the check that actually matters:
--   insert into holidays (day, label) values (school_today() + 2, 'Nope');
--   -> ERROR: new row violates row-level security policy
--   select * from holidays;  -> succeeds, they can read the calendar
--
-- The submission guard, with any token, against a duty left standing because
-- it was already submitted... use a pending one that predates the trigger:
--   update duties set state = 'submitted' where id = '<a class duty on a holiday>';
--   -> ERROR: Friday 25 December is a declared holiday (Winter break). …
