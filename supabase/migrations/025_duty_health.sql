-- 025 — Something outside the school notices when the morning has no duties.
--
-- WHY
-- 024 creates the day's checkpoints at 00:30, and a cron job fails silently.
-- Nobody is awake to see it. The first sign would be thirty teachers standing
-- in a corridor at 7:25 with an empty Duties tab, and by then the morning is
-- already lost.
--
-- Asking a person to remember to check every morning is not a design. This
-- lets the keep-alive workflow check instead, six times a day, and turn the
-- build red — which sends an email — when the answer is wrong.
--
-- WHAT IT CHECKS
-- The OUTCOME, not the mechanism. `cron.job_run_details` would say whether the
-- job ran; this says whether the school has a day to mark, which is the thing
-- anyone actually cares about. It stays true if the duties arrive some other
-- way — a coordinator running seed-duties-today.sql by hand after a failure —
-- and false if the job "succeeded" but produced nothing.
--
-- WHAT IT EXPOSES
-- Four numbers and a date. No names, no marks, no roster, nothing about a
-- student. It is granted to `anon` on purpose: the caller is a GitHub Action
-- holding only the public anon key, and a monitor that needs a staff login is
-- a monitor that stops working the day that login is disabled.
--
-- `duties` itself stays closed to anon — 012 saw to that, and this does not
-- widen it. The function returns aggregates computed inside a security definer
-- boundary; the rows never leave the database.

create or replace function duty_health()
returns table (
  day            date,
  duties         int,
  classes        int,
  morning_duties int,
  unrostered     int,
  healthy        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select school_today() as today
  ),
  counts as (
    select
      (select today from d) as day,
      (select count(*)::int from duties where day = (select today from d)) as duties,
      (select count(distinct grade || '|' || section)::int
         from students where active) as classes,
      (select count(*)::int from duties
        where day = (select today from d) and checkpoint_id = 'morning') as morning_duties,
      (select count(*)::int from duties
        where day = (select today from d) and staff_id is null) as unrostered
  )
  select
    c.day, c.duties, c.classes, c.morning_duties, c.unrostered,
    -- Healthy means: every class has a morning duty, and there is at least one
    -- of the school-wide checkpoints too. A count that merely exceeds zero
    -- would pass a half-built day, which is the failure most worth catching —
    -- a job that died part-way is harder to notice than one that never ran.
    (c.morning_duties >= c.classes and c.duties > c.morning_duties) as healthy
  from counts c;
$$;

revoke all on function duty_health() from public;
grant execute on function duty_health() to anon, authenticated;

comment on function duty_health() is
  'Aggregate-only health check for the nightly duty generation (024). Safe for '
  'anon: returns counts, never rows. Used by .github/workflows/keep-alive.yml.';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select * from duty_health();
--   -> healthy = true once the day has a morning duty per class plus the
--      school-wide checkpoints.
--
-- With the ANON key, which is what the workflow uses:
--   curl -s "$URL/rest/v1/rpc/duty_health" -X POST -H "apikey: $ANON" \
--        -H 'Content-Type: application/json' -d '{}'
--
-- And confirm it did NOT open the door to anything else:
--   curl -s "$URL/rest/v1/duties?select=id&limit=1" -H "apikey: $ANON"
--   -> [] — still closed by 012.
