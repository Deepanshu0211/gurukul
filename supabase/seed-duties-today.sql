-- seed-duties-today.sql
--
-- Today's checkpoints, built from the register rather than typed out.
--
-- WHY THIS EXISTS
-- `duties` rows are per-day, and nothing creates them. seed.sql says the job
-- is "normally generated nightly by cron-generate-duties" — that job has never
-- been written. The duties in seed-mock-school.sql are dated the day that file
-- was run, so the morning after, the whole school opens the app to an empty
-- Duties tab and no way to mark anybody.
--
-- This is the stopgap and the specification for that cron job at once: run it
-- and today has its checkpoints. Run it again and nothing changes.
--
-- WHAT IT BUILDS
--   one morning-attendance duty per class, rostered to that class's teacher
--   mangalarati, lunch and night for the residential/whole school
--   three band breakfasts, to the cover teachers
--
-- Saturday's twelve house duties are NOT here — seed-saturday.sql owns those,
-- and the school takes Saturday by house rather than by class.
--
-- IDS CARRY THE DATE
-- `morn-8B-20260912`, not `morn-8B`. The primary key is the id alone, so a
-- date-less id can only ever belong to one day: re-running it tomorrow MOVES
-- yesterday's duty, and its attendance rows go with it. Yesterday's register
-- would quietly become today's. Whatever writes duties nightly must stamp the
-- date into the id, which is the one thing worth copying from this file.

begin;

alter table duties disable trigger user;

-- ── MORNING ATTENDANCE, ONE PER CLASS ───────────────────────────────────────
-- Driven off `staff.class_key`, so a class that changes teacher gets the right
-- name tomorrow without this file being edited. A class with no teacher still
-- gets its duty — unrostered, which is visible and fixable, rather than absent,
-- which is not.
insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
select
  'morn-' || replace(k.class_key, '|', '-') || '-' || to_char(school_today(), 'YYYYMMDD'),
  'morning',
  school_today(),
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
  -- min(id) so two staff sharing a class key cannot produce two duties for it.
  select min(id) as id from staff where class_key = k.class_key
) t on true
on conflict (id) do update
  set group_label = excluded.group_label,
      class_key   = excluded.class_key,
      staff_id    = excluded.staff_id;

-- ── THE SCHOOL-WIDE AND BAND CHECKPOINTS ────────────────────────────────────
-- staff_id falls back to the coordinator when a named cover teacher is absent
-- from the register, so a checkpoint is never left with a dangling roster.
insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
select v.id || '-' || to_char(school_today(), 'YYYYMMDD'), v.cp, school_today(),
       v.label, null, v.scope, v.band, null,
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
      staff_id    = excluded.staff_id;

alter table duties enable trigger user;

commit;

-- ── CHECK ───────────────────────────────────────────────────────────────────
select 'duties today'      as what, count(*)::text as n from duties where day = school_today()
union all select 'morning',        count(*)::text from duties where day = school_today() and checkpoint_id = 'morning'
union all select 'unrostered',     count(*)::text from duties where day = school_today() and staff_id is null
union all select 'classes',        count(distinct grade || '|' || section)::text from students where active;
