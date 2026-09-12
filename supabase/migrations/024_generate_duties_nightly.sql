-- 024 — The checkpoints exist before anyone arrives to mark them.
--
-- THE GAP THIS CLOSES
-- `duties` rows are per-day, and until now nothing created them. seed.sql has
-- said since the first commit that they are "normally generated nightly by
-- cron-generate-duties from recurring defaults; inserted directly here because
-- that job is not built yet". It was never built. The consequence is not
-- subtle: the morning after the register is seeded, every teacher in the
-- school opens the app to an empty Duties tab and no way to mark anybody.
--
-- WHAT RUNS
-- 19:00 UTC every day, which is 00:30 IST — half an hour into the new school
-- day and four hours before Mangalarati. `school_today()` (023) has already
-- rolled over by then, so the job asks for "today" and gets the day that just
-- began.
--
-- The 00:30 choice is the whole reason 023 had to land first. On the UTC clock
-- the job fires at 19:00 on what UTC still calls yesterday; `current_date`
-- would have stamped every duty a day early, and the app — which computes its
-- date from the phone — would have found nothing.
--
-- WHAT IT DOES NOT DO
-- Saturday. The school takes Saturday by house, not by class, and those twelve
-- duties live in seed-saturday.sql. This job creates the weekday class
-- checkpoints every day including Saturday; the house sheet is layered on top
-- when the school asks for it. Ask them before making that automatic — a
-- Saturday with both would double-count.

create extension if not exists pg_cron;

-- ── THE GENERATOR ───────────────────────────────────────────────────────────
-- The same statements as seed-duties-today.sql, which stays as the by-hand
-- version for a day the job missed. Kept idempotent: re-running changes the
-- roster to match staff, never the marks.
--
-- `security definer` so the cron job and a coordinator triggering it from the
-- app both reach the same code, rather than the job quietly having powers the
-- app cannot exercise.
create or replace function generate_duties(p_day date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d     date := coalesce(p_day, school_today());
  stamp text := to_char(d, 'YYYYMMDD');
  n     int;
begin
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

  -- The school-wide and band checkpoints.
  insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
  select v.id || '-' || stamp, v.cp, d, v.label, null, v.scope, v.band, null,
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

  select count(*) into n from duties where day = d;
  return n;
end;
$$;

revoke all on function generate_duties(date) from public;
grant execute on function generate_duties(date) to authenticated;

comment on function generate_duties(date) is
  'Creates the day''s checkpoints from the register. Idempotent: never resets a '
  'submitted duty. Runs nightly from cron job generate-duties-nightly.';

-- ── THE SCHEDULE ────────────────────────────────────────────────────────────
-- Unscheduled first so re-running this file does not leave two jobs racing to
-- insert the same ids.
select cron.unschedule('generate-duties-nightly')
 where exists (select 1 from cron.job where jobname = 'generate-duties-nightly');

-- 19:00 UTC = 00:30 IST. pg_cron reads its schedules in UTC unless
-- cron.timezone says otherwise, so the conversion is written here rather than
-- assumed.
select cron.schedule(
  'generate-duties-nightly',
  '0 19 * * *',
  $job$ select generate_duties(); $job$
);

-- ── CATCH UP ON TODAY ───────────────────────────────────────────────────────
-- The first run is tonight, so without this the day this migration lands still
-- has no checkpoints.
select generate_duties();

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select * from cron.job where jobname = 'generate-duties-nightly';
--   select count(*) from duties where day = school_today();   -- 24 today
--
-- After the first night, and this is the check worth actually doing:
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;
--
-- A job that fails does so silently at half past midnight. Nobody is watching,
-- and the first sign is thirty teachers with an empty Duties tab. Look at
-- job_run_details the first few mornings rather than trusting it.
