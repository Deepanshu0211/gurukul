-- 045 — duty_health() checks today against the roster, not a fixed shape.
--
-- 025 called a day healthy when every class had its own 'morning' register.
-- Since 043 the roster comes from duty_defaults and Physical Activity is one
-- whole-school register, so that rule would fail every day. Healthy now means:
-- every active group that should run today has its register — or today is a
-- holiday. Same columns as before, so the keep-alive workflow keeps working:
--   classes        = registers the roster expects today
--   morning_duties = of those, how many exist
-- Counts only, no names, so the anon key may still call it. Re-runnable.

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
  with t as (select school_today() as today),
  expected as (
    select dd.id from duty_defaults dd join checkpoints c on c.id = dd.checkpoint_id, t
     where dd.active and c.active and extract(dow from t.today)::int = any (dd.days)
  ),
  counts as (
    select
      t.today as day,
      (select count(*)::int from duties where day = t.today) as duties,
      (select count(*)::int from expected) as expected,
      (select count(*)::int from duties x
        where x.day = t.today and x.default_id in (select id from expected)) as made,
      (select count(*)::int from duties where day = t.today and staff_id is null) as unrostered,
      exists (select 1 from holidays h where h.day = t.today) as holiday
    from t
  )
  select c.day, c.duties, c.expected, c.made, c.unrostered,
         c.holiday or (c.expected > 0 and c.made >= c.expected)
    from counts c;
$$;
revoke all on function duty_health() from public;
grant execute on function duty_health() to anon, authenticated;

-- VERIFY:  select * from duty_health();   -- healthy = true
