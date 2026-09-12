-- 028 — Generate tomorrow as well as today, so the clock stops mattering.
--
-- WHY
-- 024 scheduled `select generate_duties();` at 00:30 IST, and the timing was
-- load-bearing: the function builds "today", so it had to run in the small
-- hours of the day it was building. Within hours of that going in, the job's
-- schedule was edited in the dashboard to 15:05 UTC — 20:35 IST — and the
-- whole thing silently stopped working. At 20:35 `school_today()` is still the
-- day that is ending, so the job rebuilt a day that already existed and the
-- next morning would have opened with nothing.
--
-- Nobody did anything unreasonable. A job whose correctness depends on the
-- hour it runs, with nothing in its name or command to say so, is a job that
-- will be rescheduled by someone who does not know that. The fix is to stop
-- depending on the hour.
--
-- WHAT THIS DOES
-- Ensures BOTH today and tomorrow have their checkpoints. Then:
--
--   * at 00:30, today is built (as before) and tomorrow gets a head start
--   * at 20:35, tomorrow is built in good time for the morning
--   * at any other hour, both days are covered
--   * a run that is missed entirely is repaired by the next one, whenever
--     that is, instead of costing a morning
--
-- Still idempotent, still incapable of touching a submitted register — it is
-- the same `generate_duties()` underneath, called twice.

create or replace function generate_duties_ahead()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t date := school_today();
  a int;
  b int;
begin
  perform generate_duties(t);
  perform generate_duties(t + 1);
  select count(*) into a from duties where day = t;
  select count(*) into b from duties where day = t + 1;
  return format('%s: %s checkpoints. %s: %s checkpoints.', t, a, t + 1, b);
end;
$$;

revoke all on function generate_duties_ahead() from public;
grant execute on function generate_duties_ahead() to authenticated;

comment on function generate_duties_ahead() is
  'Ensures today AND tomorrow have checkpoints, so the nightly job is correct '
  'whatever hour it is scheduled for. Safe to run repeatedly.';

-- ── POINT THE NIGHTLY JOB AT IT ─────────────────────────────────────────────
-- The schedule is left exactly as whoever last edited it set it. That is the
-- point of this migration: the hour no longer decides whether it works.
-- cron.alter_job, not an UPDATE: pg_cron owns its catalogue and revokes
-- write access to it even from the postgres role.
do $$
declare j record;
begin
  for j in
    select jobid from cron.job
     where jobname in ('generate-duties-nightly', 'generate-duties-testing')
  loop
    perform cron.alter_job(j.jobid, command => 'select generate_duties_ahead();');
  end loop;
end
$$;

-- Cover the gap now, rather than waiting for the next scheduled run.
select generate_duties_ahead();

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select generate_duties_ahead();
--   -> '2026-09-12: 24 checkpoints. 2026-09-13: 24 checkpoints.'
--
--   select day, count(*) from duties
--    where day >= school_today() group by day order by day;
--   -> two rows, 24 each
--
-- The case this exists for — the job running late in the evening:
--   the 20:35 run builds tomorrow, and tomorrow's teachers find their
--   checkpoints waiting. Before this, they found nothing.
