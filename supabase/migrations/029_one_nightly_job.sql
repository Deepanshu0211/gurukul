-- 029 — One scheduled job, one button.
--
-- 026 added `generate-duties-testing` on a four-hourly schedule so the
-- generator could be watched during working hours. It served its purpose and
-- is now noise: the generator is proven, and a second job writing duties on a
-- schedule nobody asked for is exactly the kind of thing that ends up running
-- in a school's database with no one able to say why.
--
-- What remains:
--
--   generate-duties-nightly   00:30 IST, every day   builds today and tomorrow
--   reset-day-for-testing     never                  only on "Run command"
--
-- The reset stays, because that is the one people actually press. The
-- four-hourly generator goes, because nobody presses it and it does not need
-- pressing.

-- ── DROP THE FOUR-HOURLY GENERATOR ──────────────────────────────────────────
select cron.unschedule('generate-duties-testing')
 where exists (select 1 from cron.job where jobname = 'generate-duties-testing');

-- ── PUT THE NIGHTLY JOB BACK ON ITS INTENDED SCHEDULE ───────────────────────
-- 19:00 UTC is 00:30 IST. With `generate_duties_ahead()` (028) the hour is no
-- longer load-bearing — it builds today AND tomorrow either way — but 00:30 is
-- still the right answer: it is the quietest moment in the school's day, four
-- hours before Mangalarati, and it leaves the whole working day for someone to
-- notice and fix a failure.
--
-- Setting the command as well as the schedule. Editing a job in the Supabase
-- dashboard rewrites BOTH, and this job came back pointing at
-- `generate_duties()` — today only — after one such edit, which is precisely
-- the fault 028 exists to prevent.
do $$
declare j record;
begin
  select jobid into j from cron.job where jobname = 'generate-duties-nightly';
  if not found then
    perform cron.schedule(
      'generate-duties-nightly', '0 19 * * *', 'select generate_duties_ahead();'
    );
  else
    perform cron.alter_job(
      j.jobid,
      schedule => '0 19 * * *',
      command  => 'select generate_duties_ahead();'
    );
  end if;
end
$$;

-- Cover today and tomorrow now, so nothing waits on the next run.
select generate_duties_ahead();

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select jobname, schedule, command, active from cron.job order by jobid;
--   -> generate-duties-nightly  0 19 * * *    select generate_duties_ahead();
--   -> reset-day-for-testing    0 0 30 2 *    select reset_school_day();
--   and nothing else.
--
-- IF YOU EDIT THE NIGHTLY JOB IN THE DASHBOARD
-- Check the Command column afterwards. It must still read
-- `generate_duties_ahead()`. `generate_duties()` alone builds only the current
-- day, which is wrong at every hour except the small ones.
