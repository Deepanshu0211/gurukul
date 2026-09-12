-- 027 — One tap to hand the testers a fresh, unmarked school day.
--
-- WHAT IT IS FOR
-- Testing the app means marking a register, and a register can only be marked
-- once. After that every duty reads "submitted" and there is nothing left to
-- try until tomorrow. `reset_school_day()` puts the day back to the state a
-- teacher finds at 7:25 in the morning: every checkpoint there, every one
-- pending, no marks against any of them.
--
-- Wired to a cron job whose schedule can never occur, so it runs ONLY when
-- somebody presses "Run command" in Integrations -> Cron.
--
-- WHAT IT DESTROYS
-- Every attendance mark for that day. On this database those are generated
-- test marks and losing them costs nothing. On the school's database they are
-- the register — the record of which children were where — and there is no
-- undo, no backup of it anywhere else, and nobody would notice until a parent
-- asked about a Tuesday three weeks ago.
--
-- THE GUARD
-- So it refuses to run unless the database says it is a test database. That is
-- a row in `app_env`, and production simply does not have it. If this
-- migration is ever applied to the school's project — by a careless `\i`, by
-- someone replaying the whole migrations folder — the function exists and does
-- nothing, which is the behaviour worth having.
--
-- The guard is deliberately a piece of DATA rather than a flag in this file.
-- A file can be copied to the wrong server; the row has to be put there on
-- purpose.

-- ── WHICH DATABASE IS THIS? ─────────────────────────────────────────────────
create table if not exists app_env (
  key   text primary key,
  value text not null,
  set_at timestamptz not null default now()
);

comment on table app_env is
  'Marks what this database is for. The row (environment, testing) enables '
  'destructive test helpers. The school''s database must NOT have it.';

alter table app_env enable row level security;

-- Readable by staff so the app could show a "test data" banner later; writable
-- by nobody through the API. Changing it is a deliberate act at the SQL editor.
drop policy if exists app_env_read on app_env;
create policy app_env_read on app_env for select to authenticated using (true);

insert into app_env (key, value) values ('environment', 'testing')
on conflict (key) do nothing;

create or replace function is_testing_env()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_env where key = 'environment' and value = 'testing'
  );
$$;

-- ── THE RESET ───────────────────────────────────────────────────────────────
create or replace function reset_school_day(p_day date default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d       date := coalesce(p_day, school_today());
  marks   int;
  duties_ int;
begin
  if not is_testing_env() then
    raise exception
      'reset_school_day is disabled: this is not a testing database. It deletes every attendance mark for the day.'
      using errcode = '42501';
  end if;

  select count(*) into marks
    from attendance a join duties dd on dd.id = a.duty_id where dd.day = d;

  -- In foreign-key order. audit_log goes too: its entries point at duties that
  -- are about to stop existing, and a history of a day that was never marked
  -- is worse than no history — it would show submissions with nothing behind
  -- them. On the school's database this is precisely the line that makes the
  -- guard above necessary.
  delete from alert_resolutions ar using duties dd
        where ar.duty_id = dd.id and dd.day = d;
  delete from audit_log al using duties dd
        where al.duty_id = dd.id and dd.day = d;
  delete from attendance a using duties dd
        where a.duty_id = dd.id and dd.day = d;
  delete from duties where day = d;

  -- Rebuild from the register, exactly as the nightly job does.
  perform generate_duties(d);
  select count(*) into duties_ from duties where day = d;

  return format(
    '%s reset: %s marks cleared, %s checkpoints rebuilt, all pending.',
    d, marks, duties_
  );
end;
$$;

revoke all on function reset_school_day(date) from public;
-- Not granted to `anon`, and not to `authenticated` either: nothing in the app
-- should be able to call this. The cron job runs as the job owner.
grant execute on function reset_school_day(date) to postgres;

comment on function reset_school_day(date) is
  'TESTING ONLY. Deletes a day''s marks and rebuilds its checkpoints as '
  'pending. Refuses unless app_env says environment=testing.';

-- ── THE BUTTON ──────────────────────────────────────────────────────────────
-- 30 February never happens, so this job never fires on its own. It exists so
-- that "Run command" in the dashboard has something to run. A job set inactive
-- would be tidier, but an inactive job is easy to leave switched on by
-- accident after a debugging session; a date that cannot occur is not.
select cron.unschedule('reset-day-for-testing')
 where exists (select 1 from cron.job where jobname = 'reset-day-for-testing');

select cron.schedule(
  'reset-day-for-testing',
  '0 0 30 2 *',
  $job$ select reset_school_day(); $job$
);

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select reset_school_day();
--   -> '2026-09-12 reset: 1713 marks cleared, 24 checkpoints rebuilt, all pending.'
--
--   select count(*) from duties where day = school_today() and state = 'pending';
--   -> 24
--
-- And that the guard actually guards. On a database with no app_env row:
--   select reset_school_day();
--   -> ERROR: reset_school_day is disabled: this is not a testing database.
--
-- BEFORE THE SCHOOL USES THIS APP
--   delete from app_env where key = 'environment';
--   select cron.unschedule('reset-day-for-testing');
-- Either one is enough. Do both.
