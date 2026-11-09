-- 043 — The school's own daily timetable.
--
-- Given by the school (Nov 2026). Start times are theirs; every window runs to
-- midnight (their choice — marking is no longer clock-locked, 041, so the end
-- only drives Due / Overdue). A coordinator can change any time afterwards in
-- Checkpoints & groups (app) or Timings (web).
--
--   Mangalarati        5:15  whole school, residential — one register
--   Physical Activity  6:15  whole school, residential — one register
--   Breakfast          7:30  whole school, residential — one register
--   Assembly           8:00  all students, one register per class-section
--   Lunch              2:00  all students, one register per class-section
--   Remedial class     3:15  residential, one register per class-section
--   Sports assembly    4:15  whole school, residential — one register
--   Evening self study 6:15  whole school, residential — one register
--   Dinner             7:15  whole school, residential — one register
--   Night attendance   9:15  whole school, residential — kept by request
--
-- Everything else is switched off (history kept). The roster now comes ONLY
-- from duty_defaults, so what the coordinator sees in Checkpoints & groups is
-- exactly what gets generated; the old built-in generator becomes a no-op.
-- "Class-section" means the real sections (6|KRISHNA, 6|BALRAM …), marked by
-- that section's class teacher; a section with no teacher falls to a
-- coordinator, who can reassign it. Re-runnable.

-- ── 1. Checkpoints ──────────────────────────────────────────────────────────
insert into checkpoints (id, name, start_min, end_min, mandatory_escalation, active) values
  ('mang',          'Mangalarati',         315, 1440, false, true),
  ('morning',       'Physical Activity',   375, 1440, false, true),
  ('breakfast',     'Breakfast prasadam',  450, 1440, true,  true),
  ('assembly',      'Assembly',            480, 1440, false, true),
  ('lunch',         'Lunch prasadam',      840, 1440, false, true),
  ('remedial',      'Remedial class',      915, 1440, false, true),
  ('sports',        'Sports assembly',     975, 1440, false, true),
  ('evening-study', 'Evening self study', 1095, 1440, false, true),
  ('dinner',        'Dinner prasadam',    1155, 1440, true,  true),
  ('night',         'Night attendance',   1275, 1440, true,  true)
on conflict (id) do update
  set name = excluded.name, start_min = excluded.start_min, end_min = excluded.end_min,
      mandatory_escalation = excluded.mandatory_escalation, active = true;

update checkpoints set active = false
 where id not in ('mang','morning','breakfast','assembly','lunch','remedial',
                  'sports','evening-study','dinner','night');

-- ── 2. The roster is the coordinator's groups, nothing hidden ───────────────
-- Same signature as the function it replaces, default included, or Postgres
-- refuses the replace (42P13).
create or replace function generate_builtin_duties(p_day date default null)
returns int language sql security definer set search_path = public
as $$ select 0 $$;
revoke all on function generate_builtin_duties(date) from public, anon, authenticated;

update duty_defaults set active = false, updated_at = now()
 where active and id not like 'std-%';

-- ── 3. Standard groups ──────────────────────────────────────────────────────
-- Whole school, residential: one register each. No marker chosen yet → the
-- generator gives it to a coordinator until one is assigned.
insert into duty_defaults (id, checkpoint_id, group_label, scope, active)
select 'std-' || c.id, c.id, 'All residential students', 'res', true
  from (values ('mang'),('morning'),('breakfast'),('sports'),
               ('evening-study'),('dinner'),('night')) as c(id)
on conflict (id) do update
  set checkpoint_id = excluded.checkpoint_id, group_label = excluded.group_label,
      class_key = null, scope = 'res', band = null, house = null,
      members = null, excluded = null, active = true, updated_at = now();

-- One register per class-section, by its class teacher.
with sections as (
  select distinct grade, section, grade || '|' || section as class_key,
         'Class ' || grade || ' ' || initcap(section) as label
    from students where active
),
plan as (
  select 'assembly' as cp, 'all' as scope union all
  select 'lunch', 'all' union all
  select 'remedial', 'res'
)
insert into duty_defaults (id, checkpoint_id, group_label, class_key, scope, staff_id, active)
select 'std-' || p.cp || '-' || lower(replace(s.class_key, '|', '-')),
       p.cp, s.label, s.class_key, p.scope,
       (select st.id from staff st
         where st.active and st.role = 'teacher'
           and st.class_key in (s.class_key, s.grade || '|*')
         order by (st.class_key = s.class_key) desc, st.id limit 1),
       true
  from sections s cross join plan p
  -- A residential-only register for a section with no residential students
  -- would be empty every day.
 where p.scope = 'all'
    or exists (select 1 from students x where x.active and x.grade = s.grade
                and x.section = s.section and x.stype <> 'Day Scholar')
on conflict (id) do update
  set group_label = excluded.group_label, class_key = excluded.class_key,
      scope = excluded.scope, staff_id = coalesce(duty_defaults.staff_id, excluded.staff_id),
      active = true, updated_at = now();

-- ── 4. Rebuild today and tomorrow ───────────────────────────────────────────
-- Registers nobody has started are withdrawn and remade from the groups above.
-- Anything with a mark in it is left alone.
delete from duties d
 where d.day >= school_today() and d.state = 'pending'
   and coalesce(d.default_id, '') not like 'std-%'
   and not exists (select 1 from attendance a where a.duty_id = d.id);

select generate_duties(school_today());
select generate_duties(school_today() + 1);

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select name, start_min/60.0 as starts, active from checkpoints order by start_min;
--   select c.name, count(*) from duties d join checkpoints c on c.id = d.checkpoint_id
--    where d.day = school_today() group by c.name, c.start_min order by c.start_min;
--   -- expect 1 register for each whole-school checkpoint, one per section otherwise
--   select group_label from duty_defaults where active and staff_id is null;
--   -- sections still needing a class teacher (they go to a coordinator until set)
