-- 026 — A second, frequent duty-generation job, for testing only.
--
-- WHY
-- `generate-duties-nightly` (024) fires once a day at 00:30 IST. That is right
-- for the school and useless for testing: you would have to stay up, or wait a
-- day between attempts, to find out whether it works.
--
-- This runs the identical command every four hours — six times a day — so the
-- mechanism can be watched during working hours.
--
-- HOW TO ACTUALLY TEST IT
-- Running it repeatedly against a day that already has duties does NOTHING
-- VISIBLE, because `generate_duties()` is idempotent by design. Re-running is
-- how it stays safe to re-run, not a demonstration that it works.
--
-- To see it do its job, take the day away and watch it come back:
--
--   -- 1. today's duties, and no marks against them yet
--   select count(*) from duties where day = school_today();     -- 24
--
--   -- 2. remove them. attendance references duties, so clear that first --
--   --    which is exactly why you do this on a test database and not a real
--   --    one. On a real one, deleting a day deletes the register for that day.
--   delete from attendance a using duties d
--    where a.duty_id = d.id and d.day = school_today();
--   delete from duties where day = school_today();
--   select count(*) from duties where day = school_today();     -- 0
--
--   -- 3. either wait for the next four-hourly run, or do it now:
--   select generate_duties();
--   select count(*) from duties where day = school_today();     -- 24 again
--
-- RUNNING IT WHENEVER YOU WANT
-- You never needed a cron job for that. In the SQL editor:
--
--   select generate_duties();               -- today
--   select generate_duties('2026-09-20');   -- any specific day
--
-- That is the same function both jobs call, so a manual run and a scheduled
-- run are the same event.
--
-- TURNING IT OFF
-- Before the school relies on this, or any time it becomes noise:
--
--   select cron.unschedule('generate-duties-testing');
--
-- or the toggle in Integrations -> Cron -> Jobs. Leaving it on is harmless —
-- it cannot overwrite a submitted register, which 024 guarantees and the
-- header there explains — but a job nobody meant to leave running is how a
-- database ends up with things in it nobody can account for.

-- Unscheduled first, so re-running this file leaves one job rather than two.
select cron.unschedule('generate-duties-testing')
 where exists (select 1 from cron.job where jobname = 'generate-duties-testing');

-- Every four hours on the hour, in UTC: 00:00, 04:00, 08:00 … which is 05:30,
-- 09:30, 13:30 … IST. Six runs a day, none of them at an hour that matters to
-- the school, so a failure here is never confused with the real job's.
select cron.schedule(
  'generate-duties-testing',
  '0 */4 * * *',
  $job$ select generate_duties(); $job$
);

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job order by jobname;
--   -> generate-duties-nightly  0 19 * * *   t
--   -> generate-duties-testing  0 */4 * * *  t
--
-- After a few hours, which is the point of the frequent schedule:
--   select jobname, status, return_message, start_time
--     from cron.job_run_details
--    where jobname = 'generate-duties-testing'
--    order by start_time desc limit 5;
--
-- A `status` of 'succeeded' with a `return_message` of 'SELECT 1' is a run that
-- worked. Anything else is the failure you wanted to find before the school
-- did.
