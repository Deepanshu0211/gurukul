-- seed.sql
-- Reference data and pilot records. Safe to re-run: every statement upserts.
--
-- Students are NOT here — the 415-row register lives in
-- docs/data/students_415_insert.sql, generated from the school's own file.

-- ── STATUS TYPES ────────────────────────────────────────────────────────────
-- Present is the absence of a row (the default), so it has no code here.
-- Only 'A' is unaccounted-for; everything else means the school knows where
-- the child is. `spanning` types carry forward to later checkpoints (SRS S3).
insert into status_types (code, label, accounted, spanning) values
  ('A', 'Absent',      false, false),
  ('H', 'Home',        true,  true),
  ('S', 'Sick',        true,  true),
  ('O', 'Outing',      true,  true),
  ('G', 'Gita Nagari', true,  true),
  ('V', 'Activity',    true,  false),
  ('Y', 'Self study',  true,  false)
on conflict (code) do update
  set label = excluded.label,
      accounted = excluded.accounted,
      spanning = excluded.spanning;

-- ── CHECKPOINTS ─────────────────────────────────────────────────────────────
-- Times are minutes from midnight. The full weekday schedule in the SRS has
-- 8-10 checkpoints; these five cover the pilot.
insert into checkpoints (id, name, start_min, end_min) values
  ('mang',      'Mangalarati',        270,  300),   -- 4:30-5:00 AM
  ('breakfast', 'Breakfast prasadam', 405,  450),   -- 6:45-7:30 AM
  ('morning',   'Morning attendance', 450,  470),   -- 7:30-7:50 AM
  ('lunch',     'Lunch prasadam',     750,  790),   -- 12:30-1:10 PM
  ('night',     'Night attendance',  1275, 1300)    -- 9:15-9:40 PM
on conflict (id) do update
  set name = excluded.name,
      start_min = excluded.start_min,
      end_min = excluded.end_min;

-- ── STAFF ───────────────────────────────────────────────────────────────────
-- auth_user_id is filled in by the linking statement further down, once the
-- matching Supabase Auth users exist.
insert into staff (id, name, role, email, class_key, class_label) values
  ('t1', 'Krishna Saha Mt',    'teacher',      'krishna.saha@bgis.org', '4|A',      'Class 4 A'),
  ('t2', 'Ajay Solanki Pr',    'teacher',      'ajay.solanki@bgis.org', '9|BALRAM', 'Class 9 Balram'),
  ('c1', 'Ashram Coordinator', 'coordinator',  'coordinator@bgis.org',  null, null),
  ('c2', 'MOD',                'coordinator',  'mod@bgis.org',          null, null),
  ('m1', 'Principal Office',   'management',   'principal@bgis.org',    null, null),
  ('a1', 'Admin Desk',         'admin',        'admin@bgis.org',        null, null),
  ('n1', 'Sister Nurse',       'nurse',        'nurse@bgis.org',        null, null)
on conflict (id) do update
  set name = excluded.name,
      role = excluded.role,
      email = excluded.email,
      class_key = excluded.class_key,
      class_label = excluded.class_label;

-- ── DUTIES (pilot day) ──────────────────────────────────────────────────────
-- Normally generated nightly by cron-generate-duties from recurring defaults;
-- inserted directly here because that job is not built yet.
insert into duties (id, checkpoint_id, group_label, class_key, scope, staff_id) values
  ('mang',      'mang',      'All residential students', null,       'res', 'c1'),
  ('bfast-sr',  'breakfast', 'Senior · residential',     null,       'res', 't2'),
  ('morn-4A',   'morning',   'Class 4 A',                '4|A',      null,  't1'),
  ('morn-9B',   'morning',   'Class 9 Balram',           '9|BALRAM', null,  't2'),
  ('lunch-mid', 'lunch',     'Middle · all students',    null,       'all', 'c1'),
  ('night-sr',  'night',     'Senior · residential',     null,       'res', 't2')
on conflict (id) do update
  set checkpoint_id = excluded.checkpoint_id,
      group_label = excluded.group_label,
      class_key = excluded.class_key,
      scope = excluded.scope,
      staff_id = excluded.staff_id;

-- ── LINK STAFF TO AUTH USERS ────────────────────────────────────────────────
-- Run AFTER creating the Auth users (see supabase/README.md). Every RLS policy
-- keys off auth_user_id, so a staff row without it can do nothing.
update staff s
   set auth_user_id = u.id
  from auth.users u
 where s.email = u.email
   and s.auth_user_id is distinct from u.id;
