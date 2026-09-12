-- seed-history.sql
--
-- TEST DATA. A month of attendance behind today, so the range report, the
-- calendar dots and a student's 30-day record have something to show.
--
-- WHAT IT MAKES
--   * checkpoints for every school day in the last 30 (Sundays skipped)
--   * a mark for every child at every checkpoint they belong to
--   * a scattering of substitutes, so the "Taken by … (cover)" column on the
--     printed register has real cases in it
--
-- Roughly 26 school days x ~1,700 marks — about 45,000 rows. It takes a
-- minute. Postgres does not care; PostgREST's 1000-row cap does, which is why
-- every reader was paged before this file was written.
--
-- NOT RANDOM NOISE
-- A child who is away is usually away for a run of days, not for one
-- checkpoint on a Tuesday. Uniform randomness produces a register no teacher
-- would recognise: everyone absent once, nobody absent twice, no pattern to
-- notice. So:
--
--   * a "spell" away from school lasts a whole week (Home or Gita Nagari)
--   * being sick lasts the day, across every checkpoint in it
--   * a plain absence is per-checkpoint, and rare
--
-- Deterministic: derived from hashes of the admission number, so re-running
-- rebuilds the identical month rather than a different one. hashtext is stable
-- within a Postgres major version, which is all this needs.
--
-- Requires seed-mock-school.sql (the register) and migrations 023-024
-- (school_today, generate_duties). Safe to re-run.
--
-- ⚠ DELETES the last 30 days of attendance before rebuilding them. Test
-- databases only — on the school's, that is a month of the record of where
-- children were.

begin;

alter table attendance disable trigger user;
alter table duties     disable trigger user;

-- ── THE DAYS ────────────────────────────────────────────────────────────────
-- Sunday is not a school day. Saturday is, though the school takes it by house
-- rather than by class — seed-saturday.sql owns that sheet. Class checkpoints
-- are generated for Saturdays here anyway, because the range report is about
-- the class register and a gap every seventh row reads as missing data rather
-- than as a holiday.
create temporary table hist_days on commit drop as
select d::date as day
  from generate_series(school_today() - 30, school_today() - 1, interval '1 day') d
 where extract(dow from d) <> 0;

-- Clear first: re-running must rebuild, not double up.
delete from attendance a
 using duties d
 where a.duty_id = d.id
   and d.day in (select day from hist_days);

do $$
declare r record;
begin
  for r in select day from hist_days order by day loop
    perform generate_duties(r.day);
  end loop;
end
$$;

-- ── THE MARKS ───────────────────────────────────────────────────────────────
with roster as (
  -- Mirrors resolveGroup() in src/lib/duties.js: class_key is exclusive, while
  -- scope, band and house compose.
  select d.id as duty_id, d.day, s.admission_no
    from duties d
    join students s on s.active
   where d.day in (select day from hist_days)
     and (
          (d.class_key is not null and d.class_key = s.grade || '|' || s.section)
          or
          (d.class_key is null
           and (d.scope is null
                or (d.scope = 'res' and s.stype <> 'Day Scholar')
                or  d.scope = 'all')
           and (d.band is null
                or (d.band = 'Primary' and s.grade between 2 and 5)
                or (d.band = 'Middle'  and s.grade between 6 and 8)
                or (d.band = 'Senior'  and s.grade between 9 and 12))
           and (d.house is null or d.house = s.house))
         )
),
dice as (
  select
    duty_id,
    day,
    admission_no,
    -- Away for the whole week. The week number, not the date, is what makes it
    -- a spell rather than a coincidence.
    (abs(hashtext(admission_no || 'w' || to_char(day, 'IYYY-IW'))) % 10000) / 10000.0 as r_week,
    -- Unwell for the day: every checkpoint in it, which is what `spanning`
    -- means in seed.sql and what the infirmary actually looks like.
    (abs(hashtext(admission_no || 'd' || day::text))            % 10000) / 10000.0 as r_day,
    -- Missed this one checkpoint.
    (abs(hashtext(admission_no || 'c' || duty_id))              % 10000) / 10000.0 as r_cp
  from roster
)
insert into attendance (duty_id, admission_no, status)
select
  duty_id,
  admission_no,
  case
    when r_week < 0.010 then 'H'   -- home for the week
    when r_week < 0.014 then 'G'   -- at Gita Nagari for the week
    when r_day  < 0.018 then 'S'   -- in the infirmary today
    when r_cp   < 0.028 then 'A'   -- absent from this checkpoint
    when r_cp   < 0.036 then 'V'   -- activity: in school, counted present
    else null                       -- present
  end
from dice
on conflict (duty_id, admission_no) do update set status = excluded.status;

-- ── SUBMIT THEM, SOMETIMES BY SOMEBODY ELSE ─────────────────────────────────
-- Every checkpoint is submitted by whoever was rostered, except about one
-- class-day in twelve, which a cover teacher takes. That is what puts real
-- "(cover)" rows in the printed register instead of a column that is always
-- the same name.
update duties d
   set state = 'submitted',
       submitted_at = (d.day + make_interval(mins => c.start_min + 3)),
       submitted_by = case
         when d.class_key is not null
          and (abs(hashtext(d.id)) % 12) = 0
         then (array['d1','d2','d3'])[1 + (abs(hashtext(d.id || 'x')) % 3)]
         else d.staff_id
       end
  from checkpoints c
 where c.id = d.checkpoint_id
   and d.day in (select day from hist_days);

alter table attendance enable trigger user;
alter table duties     enable trigger user;

commit;

-- ── CHECK ───────────────────────────────────────────────────────────────────
select 'school days'    as what, count(distinct day)::text as n
  from duties where day between school_today() - 30 and school_today() - 1
union all select 'duties',        count(*)::text from duties
  where day between school_today() - 30 and school_today() - 1
union all select 'marks',         count(*)::text from attendance a
  join duties d on d.id = a.duty_id
 where d.day between school_today() - 30 and school_today() - 1
union all select 'absent (A)',    count(*)::text from attendance a
  join duties d on d.id = a.duty_id
 where d.day between school_today() - 30 and school_today() - 1 and a.status = 'A'
union all select 'sick (S)',      count(*)::text from attendance a
  join duties d on d.id = a.duty_id
 where d.day between school_today() - 30 and school_today() - 1 and a.status = 'S'
union all select 'home (H)',      count(*)::text from attendance a
  join duties d on d.id = a.duty_id
 where d.day between school_today() - 30 and school_today() - 1 and a.status = 'H'
union all select 'covered days',  count(*)::text from duties
 where day between school_today() - 30 and school_today() - 1
   and class_key is not null and submitted_by is distinct from staff_id;
