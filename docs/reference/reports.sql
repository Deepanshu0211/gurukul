-- reports.sql — ready-made queries for the Supabase SQL Editor.
--
-- Not run by the app. These are for the office: the questions that get asked
-- at a parents' meeting or a staff review, written once so two people asking
-- the same thing get the same answer.
--
-- Everything below reads `attendance_detail` (migrations/009), which already
-- knows that a NULL status means Present. Do not hand-roll that join — it is
-- four tables deep and getting it subtly wrong is how two reports of the same
-- month come to disagree.
--
-- Run these as a privileged user in the SQL Editor. Through the app's anon
-- key, RLS still applies and a teacher would see only their own scope.

-- ─────────────────────────────────────────────────────────────────────────────
-- ONE STUDENT
-- ─────────────────────────────────────────────────────────────────────────────

-- Full record for a parents' meeting. Change the admission number and dates.
select * from student_attendance('2026001', '2026-08-01', '2026-08-31');

-- The same child's totals and percentage.
select * from student_attendance_summary('2026001', '2026-08-01', '2026-08-31');

-- Just the days they were unaccounted for.
select day, checkpoint, status_label
  from attendance_detail
 where admission_no = '2026001'
   and status = 'A'
 order by day desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- A CLASS, A BAND, THE SCHOOL
-- ─────────────────────────────────────────────────────────────────────────────

-- Absences this month by class, worst first.
select grade, section, count(*) as absences
  from attendance_detail
 where status = 'A'
   and day >= date_trunc('month', current_date)
 group by grade, section
 order by absences desc;

-- Attendance percentage per student in one class, over a term.
-- The students who need a conversation are at the bottom.
select roll_no,
       student,
       count(*)                                                  as checkpoints,
       count(*) filter (where present)                           as present,
       count(*) filter (where status = 'A')                      as absent,
       round(100.0 * count(*) filter (where present) / count(*), 1) as pct
  from attendance_detail
 where class_key = '4|A'
   and day between current_date - 90 and current_date
 group by roll_no, student
 order by pct asc;

-- Which checkpoint is missed most? Usually answers a scheduling question
-- rather than a discipline one.
select checkpoint,
       count(*) filter (where status = 'A') as absences,
       count(*)                             as marks,
       round(100.0 * count(*) filter (where status = 'A') / count(*), 2) as pct_absent
  from attendance_detail
 where day >= current_date - 30
 group by checkpoint
 order by pct_absent desc;

-- Repeat absentees: three or more absences in the last 30 days.
select admission_no, student, grade, section, count(*) as absences
  from attendance_detail
 where status = 'A'
   and day >= current_date - 30
 group by admission_no, student, grade, section
having count(*) >= 3
 order by absences desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- STAFF AND THE RECORD
-- ─────────────────────────────────────────────────────────────────────────────

-- How much marking each staff member has done.
select st.name,
       count(distinct d.id)   as checkpoints_submitted,
       count(a.*)             as students_marked
  from duties d
  join staff st on st.id = d.submitted_by
  left join attendance a on a.duty_id = d.id
 where d.state = 'submitted'
 group by st.name
 order by checkpoints_submitted desc;

-- Cover marking: checkpoints submitted by someone other than the teacher they
-- were rostered to.
select d.day, c.name as checkpoint,
       owner.name    as rostered_to,
       actual.name   as submitted_by
  from duties d
  join checkpoints c   on c.id = d.checkpoint_id
  join staff owner     on owner.id = d.staff_id
  join staff actual    on actual.id = d.submitted_by
 where d.submitted_by is distinct from d.staff_id
 order by d.day desc;

-- Every overrule, with what changed. The correction trail.
select l.at,
       actor.name    as overruled_by,
       subject.name  as original_submitter,
       c.name        as checkpoint,
       s.name        as student,
       coalesce(l.old_value, 'Present') as was,
       coalesce(l.new_value, 'Present') as now
  from audit_log l
  join staff actor        on actor.id = l.actor_id
  left join staff subject on subject.id = l.subject_id
  left join duties d      on d.id = l.duty_id
  left join checkpoints c on c.id = d.checkpoint_id
  left join students s    on s.admission_no = l.admission_no
 where l.action = 'attendance_override'
 order by l.at desc;

-- Safety alerts that were resolved, and what was said.
select d.day, c.name as checkpoint, s.name as student,
       r.kind, r.remark, st.name as resolved_by, r.resolved_at
  from alert_resolutions r
  join duties d      on d.id = r.duty_id
  join checkpoints c on c.id = d.checkpoint_id
  join students s    on s.admission_no = r.admission_no
  join staff st      on st.id = r.resolved_by
 order by r.resolved_at desc;

-- Absences that were NEVER resolved. The list that should be empty, and the
-- reason the alert_resolutions table exists.
select d.day, c.name as checkpoint, s.name as student, s.grade, s.section
  from attendance a
  join duties d      on d.id = a.duty_id
  join checkpoints c on c.id = d.checkpoint_id
  join students s    on s.admission_no = a.admission_no
  left join alert_resolutions r
         on r.duty_id = a.duty_id and r.admission_no = a.admission_no
 where a.status = 'A'
   and r.duty_id is null
 order by d.day desc, c.start_min;

-- Recent activity, newest first — the same feed the Activity screen shows,
-- unfiltered.
select l.at, l.action, l.severity,
       actor.name as actor, subject.name as subject,
       l.field, l.old_value, l.new_value
  from audit_log l
  left join staff actor   on actor.id = l.actor_id
  left join staff subject on subject.id = l.subject_id
 order by l.at desc
 limit 200;


-- ─────────────────────────────────────────────────────────────────────────────
-- HEALTH CHECKS
-- ─────────────────────────────────────────────────────────────────────────────

-- Staff rows not linked to a login. Every RLS policy keys off auth_user_id,
-- so these accounts can read nothing and the app looks broken for them.
select id, name, email from staff where auth_user_id is null;

-- Duties that closed without ever being submitted.
select d.day, c.name, st.name as rostered_to
  from duties d
  join checkpoints c on c.id = d.checkpoint_id
  join staff st      on st.id = d.staff_id
 where d.state = 'pending'
   and d.day < current_date
 order by d.day desc;

-- Students with no attendance at all. Usually means they are in no duty's
-- group — a scope or class_key that matches nobody.
select s.admission_no, s.name, s.grade, s.section
  from students s
  left join attendance a on a.admission_no = s.admission_no
 where a.admission_no is null;
