-- 009 — Reading attendance back over time.
--
-- WHY
-- Every question the office actually asks spans days, not one checkpoint:
-- "how often has this child missed Mangalarati this month", "which class has
-- the most absences", "give me his record for the parents' meeting". Each of
-- those is a four-table join written by hand, and written slightly differently
-- every time — which is how two reports of the same thing come to disagree.
--
-- WHAT THIS IS
-- A view and two functions. No new stored data: everything here is computed
-- from `attendance`, so a report can never drift from the marks it describes.
-- Ready-made queries built on these live in docs/reference/reports.sql.
--
-- SECURITY
-- Views run with the privileges of the QUERYING user by default in Postgres
-- 15+ (security_invoker), which is what we want: the RLS on `attendance`,
-- `duties` and `students` still applies, so this widens what is convenient,
-- never what is visible.

-- ── ONE FLAT ROW PER MARK ───────────────────────────────────────────────────
-- The join every report needs, written once. `status is null` means Present —
-- stored as the absence of a value — so `status_label` spells it out rather
-- than leaving every caller to remember that.
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
  s.grade || '|' || s.section   as class_key,
  s.roll_no,
  s.stype,
  a.status,
  coalesce(st.label, 'Present') as status_label,
  -- The two questions worth asking of a mark: was the child there, and if
  -- not, does the school know where they were?
  (a.status is null)            as present,
  coalesce(st.accounted, true)  as accounted
from attendance a
  join duties       d  on d.id = a.duty_id
  join checkpoints  c  on c.id = d.checkpoint_id
  join students     s  on s.admission_no = a.admission_no
  left join status_types st on st.code = a.status;

-- ── ONE STUDENT, ONE DATE RANGE ─────────────────────────────────────────────
-- Powers the per-student history screen and the parents'-meeting question.
create or replace function student_attendance(
  p_admission text,
  p_from      date default current_date - 30,
  p_to        date default current_date
)
returns table (
  day          date,
  checkpoint   text,
  start_min    int,
  status       text,
  status_label text,
  present      boolean,
  accounted    boolean,
  marked_by    text
)
language sql
stable
security invoker
set search_path = public
as $$
  select ad.day, ad.checkpoint, ad.start_min, ad.status, ad.status_label,
         ad.present, ad.accounted, st.name
    from attendance_detail ad
    left join staff st on st.id = coalesce(ad.corrected_by, ad.submitted_by)
   where ad.admission_no = p_admission
     and ad.day between p_from and p_to
   order by ad.day desc, ad.start_min desc;
$$;

-- ── ONE STUDENT, THE TOTALS ─────────────────────────────────────────────────
create or replace function student_attendance_summary(
  p_admission text,
  p_from      date default current_date - 30,
  p_to        date default current_date
)
returns table (
  checkpoints  bigint,
  present      bigint,
  absent       bigint,
  elsewhere    bigint,
  pct_present  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where present),
    count(*) filter (where status = 'A'),
    -- Accounted for, but not at the checkpoint: Home, Sick, Outing, Activity.
    count(*) filter (where not present and status <> 'A'),
    -- Guarded: a student with no marks in the range must give 0, not a
    -- division error that takes the whole report down with it.
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where present) / count(*), 1)
    end
  from attendance_detail
  where admission_no = p_admission
    and day between p_from and p_to;
$$;

grant execute on function student_attendance(text, date, date)         to authenticated;
grant execute on function student_attendance_summary(text, date, date) to authenticated;
