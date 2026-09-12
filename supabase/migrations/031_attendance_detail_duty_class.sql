-- 031 — Tell the student's class apart from the duty's class.
--
-- `attendance_detail` (009) exposes `class_key` built from the STUDENT:
--
--   s.grade || '|' || s.section  as class_key
--
-- which is right, and is what scopes a class's printed register: "every mark
-- for the children of 8 Balram, at every checkpoint of the day", including
-- Mangalarati and lunch, which are marked school-wide.
--
-- But there is a second, different question — was this checkpoint the class
-- teacher's to take? — and the student's class cannot answer it. Asking it
-- anyway produced this on a printed register:
--
--   Mangalarati          Ashram Coordinator   (cover)
--   Breakfast prasadam   Radha Priya Mt       (cover)
--   Morning attendance   Gopal Das Pr         (cover)
--   Lunch prasadam       Ashram Coordinator   (cover)
--
-- Only the third line is a cover. The other three are school-wide checkpoints
-- that never belonged to 8 Balram's teacher, so calling them cover says a
-- substitute stood in four times when nobody stood in at all. On a sheet the
-- Principal signs, that is not a cosmetic error.
--
-- `duty_class_key` is the duty's own — null for anything school-wide or banded
-- — so "is this a class checkpoint, and was it taken by that class's teacher"
-- becomes answerable.
--
-- Adding a column to the view, not changing one: `class_key` keeps its meaning
-- and everything reading it is untouched.

create or replace view attendance_detail
with (security_invoker = true)
as
select
  d.day,
  d.id                          as duty_id,
  c.id                          as checkpoint_id,
  c.name                        as checkpoint,
  c.start_min,
  d.group_label,
  d.staff_id                    as rostered_to,
  d.submitted_by,
  d.submitted_at,
  d.corrected_by,
  s.admission_no,
  s.name                        as student,
  s.grade,
  s.section,
  -- The STUDENT's class. Unchanged, and still what a class register filters on.
  s.grade || '|' || s.section   as class_key,
  s.roll_no,
  s.stype,
  a.status,
  coalesce(st.label, 'Present') as status_label,
  -- The two questions worth asking of a mark: was the child there, and if
  -- not, does the school know where they were?
  (a.status is null)            as present,
  coalesce(st.accounted, true)  as accounted,
  -- APPENDED, not inserted. `create or replace view` can only add columns at
  -- the end — inserting one renames every column after it, and Postgres
  -- refuses with "cannot change name of view column". So this sits away from
  -- `class_key`, which it should be read against.
  --
  -- The DUTY's class: null when the checkpoint covers a band, the residential
  -- students, or the whole school.
  d.class_key                   as duty_class_key
from attendance a
  join duties       d  on d.id = a.duty_id
  join checkpoints  c  on c.id = d.checkpoint_id
  join students     s  on s.admission_no = a.admission_no
  left join status_types st on st.code = a.status;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select distinct checkpoint, class_key, duty_class_key
--     from attendance_detail
--    where day = school_today() and class_key = '8|BALRAM'
--    order by checkpoint;
--
--   -> Mangalarati          8|BALRAM   (null)      school-wide
--      Breakfast prasadam   8|BALRAM   (null)      a band
--      Morning attendance   8|BALRAM   8|BALRAM    the class's own
--
-- Only the row where the two agree can be a cover, and only then if the person
-- who submitted it is not that class's teacher.
