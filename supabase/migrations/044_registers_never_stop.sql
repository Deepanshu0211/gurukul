-- 044 — Registers keep being made, with no end date and no gap.
--
-- 1. The pilot's trial window (`app_env.trial_end`, last set to 2026-12-02)
--    stopped every register after that date: `apply_duty_defaults` (036)
--    returns early outside it, and the app's day picker stops there too. The
--    school is past the trial, so the end is moved out of reach.
--
-- 2. The nightly job (029, 00:30 IST) made only today and tomorrow. One missed
--    night — Supabase paused, cron hiccup — and the next morning had no
--    registers. It now keeps a week ready, so a gap needs eight missed nights.
--    Days already made are refreshed each night, so a group or holiday change
--    still reaches them.
--
-- Re-runnable. A database without `app_env` (mock) is untouched by step 1.

do $$
begin
  if to_regclass('public.app_env') is not null then
    update app_env set value = '2099-12-31' where key = 'trial_end';
  end if;
end $$;

create or replace function generate_duties_ahead()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t date := school_today();
  i int;
begin
  for i in 0..7 loop
    perform generate_duties(t + i);
  end loop;
  return format('%s to %s: %s registers', t, t + 7,
                (select count(*) from duties where day between t and t + 7));
end;
$$;
revoke all on function generate_duties_ahead() from public;
grant execute on function generate_duties_ahead() to authenticated;

-- Same job as 029, re-asserted so it exists and is active.
do $$
declare j record;
begin
  select jobid into j from cron.job where jobname = 'generate-duties-nightly';
  if not found then
    perform cron.schedule('generate-duties-nightly', '0 19 * * *', 'select generate_duties_ahead();');
  else
    perform cron.alter_job(j.jobid, schedule => '0 19 * * *',
                           command => 'select generate_duties_ahead();', active => true);
  end if;
end $$;

select generate_duties_ahead();

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select value from app_env where key = 'trial_end';             -- 2099-12-31
--   select jobname, schedule, active from cron.job;                 -- nightly, true
--   select day, count(*) from duties where day >= school_today()
--    group by day order by day;                                     -- 8 days, same count
--   select status, start_time from cron.job_run_details
--    order by start_time desc limit 5;                              -- recent runs: succeeded
