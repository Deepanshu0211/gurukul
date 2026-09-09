-- 020 — The Morning Attendance Report, as counts, one row per class.
--
-- WHY
-- 017 already does this for Saturday, where the school groups by house. The
-- weekday form is the same nine columns grouped by CLASS, and the school reads
-- it far more often — it is the sheet the Assembly Co-ordinator, the MOD and
-- the Principal all sign every morning:
--
--   Class | Res | Day | Total | Res P | Day P | Res A | Day A | Sick |
--   Not Reported (Home)/GN | Class Teacher | Signature
--
-- The school's own definitions, given verbatim:
--   Res P         residential students present
--   Day P         day scholar students present
--   Res A         residential absent
--   Day A         day scholar absent
--   Sick          admitted in the in-house infirmary / health centre
--   Not reported  not reported to school, or residential students at home
--
-- WHAT IT IS FOR
-- A class teacher wants their own row: thirty children, how many of each kind
-- turned up. Oversight wants all eighteen rows and a total.
--
-- This returns ALL classes to EVERY staff role, and that is not an oversight:
-- 005 made attendance school-wide readable on purpose, so RLS has nothing
-- left to narrow here and a plain teacher's token really does get eighteen
-- rows. Showing a teacher only their own class is a choice the SCREEN makes,
-- not a boundary this function enforces. Do not treat it as one.
--
-- Res and Day repeat unchanged every single day, which is why they are worth
-- computing rather than typing: they come from the register, so they cannot
-- drift from it, and a class whose strength changes shows the change here the
-- morning it happens.
--
-- WHAT IT IS NOT
-- Not a printing change. `attendance_headcount` (011), `saturday_report`
-- (017) and everything in reportHtml.js are untouched — the printed sheets
-- stay exactly as they are. This only answers the on-screen question.
--
-- SECURITY
-- `security invoker`, like 009, 011 and 017: RLS on attendance, duties and
-- students still decides which marks are counted. A role that cannot read a
-- mark cannot see it in a total either.

create or replace function class_status_board(
  p_day        date default current_date,
  p_checkpoint text default 'morning'
)
returns table (
  grade        int,
  section      text,
  class_key    text,
  class_label  text,
  teacher      text,
  res          bigint,
  day_scholars bigint,
  strength     bigint,
  res_present  bigint,
  day_present  bigint,
  res_absent   bigint,
  day_absent   bigint,
  sick         bigint,
  not_reported bigint,
  on_duty      bigint,
  unmarked     bigint,
  submitted    boolean,
  submitted_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  -- Every class the register actually contains, empty or not. Taken from the
  -- students table rather than from a list of eighteen, because the school
  -- splits Krishna/Balram only from Grade 6 up and that is their decision to
  -- change, not ours to hardcode twice.
  with slots as (
    select distinct s.grade, s.section
      from students s
     where s.active and s.grade between 2 and 12
  ),

  -- Who the sheet counts, before any mark is considered. Strength comes from
  -- the register, not from who happens to have been marked: an unsubmitted
  -- checkpoint must show class sizes with blank counts, not a page of zeros
  -- that reads like an empty school.
  roll as (
    select s.admission_no,
           s.grade,
           s.section,
           -- Matches isResidential() in src/lib/duties.js and the roll CTE in
           -- 017: everything except an explicit Day Scholar is residential,
           -- Day Boarding included. One definition of "Res" across the app.
           (s.stype <> 'Day Scholar') as residential
      from students s
     where s.active and s.grade between 2 and 12
  ),

  -- `marked` separates "present" (a row whose status is null) from "never
  -- marked" (no row at all). Both look like a null status after a left join,
  -- and conflating them is how an unsubmitted class shows a full attendance.
  marks as (
    select ad.admission_no, ad.status, true as marked
      from attendance_detail ad
     where ad.day = p_day
       and ad.checkpoint_id = p_checkpoint
  ),

  -- The duty covering this class at this checkpoint, for the submitted flag.
  -- `max` rather than a join: a class covered by two duties on one day would
  -- otherwise double every count in the row.
  duty as (
    select d.class_key,
           bool_or(d.state = 'submitted')                          as submitted,
           max(d.submitted_at) filter (where d.state = 'submitted') as submitted_at
      from duties d
     where d.day = p_day
       and d.checkpoint_id = p_checkpoint
       and d.class_key is not null
     group by d.class_key
  )

  select
    sl.grade,
    sl.section,
    sl.grade || '|' || sl.section,
    -- "Class 4" but "Class 6 Krishna": the single-section grades carry no
    -- letter on the paper form and should carry none here.
    case when sl.section = 'A'
         then 'Class ' || sl.grade
         else 'Class ' || sl.grade || ' ' || initcap(lower(sl.section))
    end,
    t.name,
    -- count(r.admission_no), never count(*): an empty class still produces one
    -- all-null row from the left join, and count(*) would call it a student.
    count(r.admission_no) filter (where r.residential),
    count(r.admission_no) filter (where not r.residential),
    count(r.admission_no),
    -- Activity and Self study are accounted-for and IN school, so the school
    -- counts them present. Kept identical to 017 so the Saturday and weekday
    -- sheets can never disagree about the same child.
    count(*) filter (where r.residential     and m.marked and (m.status is null or m.status in ('V','Y'))),
    count(*) filter (where not r.residential and m.marked and (m.status is null or m.status in ('V','Y'))),
    count(*) filter (where r.residential     and m.status = 'A'),
    count(*) filter (where not r.residential and m.status = 'A'),
    count(*) filter (where m.status = 'S'),
    count(*) filter (where m.status in ('H','G','O')),
    count(*) filter (where m.status in ('V','Y')),
    count(*) filter (where r.admission_no is not null and m.marked is null),
    coalesce(bool_or(du.submitted), false),
    max(du.submitted_at)
  from slots sl
  left join roll r
    on r.grade = sl.grade and r.section = sl.section
  left join marks m on m.admission_no = r.admission_no
  -- Lateral, not a plain join: two staff rows sharing a class_key would
  -- otherwise fan the class out into two rows, double its strength, and make
  -- the Total disagree with saturday_report. Co-teaching does that legitimately,
  -- and so does a stale assignment nobody cleared. Both names are shown.
  left join lateral (
    select string_agg(distinct st.name, ' / ' order by st.name) as name
      from staff st
     where st.class_key = sl.grade || '|' || sl.section
  ) t on true
  left join duty  du on du.class_key = sl.grade || '|' || sl.section
  group by sl.grade, sl.section, t.name
  -- The register's own order: 2, 3, 4, 5, 6 K, 6 B, 7 K, 7 B ... Krishna
  -- before Balram, which is alphabetical the wrong way round, hence the case.
  order by sl.grade, case sl.section when 'KRISHNA' then 1 when 'BALRAM' then 2 else 0 end;
$$;

grant execute on function class_status_board(date, text) to authenticated;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- With any staff token:
--   select * from class_status_board(current_date, 'morning');
--   -> one row per class in the register (18 with seed-mock-school.sql)
--   -> res + day_scholars = strength, for every row
--   -> res_present + day_present + res_absent + day_absent + sick
--      + not_reported + unmarked = strength, for every row
--
-- The second identity is the one worth re-checking after any change to
-- status_types: a new code that belongs in none of those buckets silently
-- disappears from the sheet, and the row stops adding up.
--
-- Before any checkpoint is submitted every count is 0 and `unmarked` equals
-- `strength`. That is correct and is what the blank paper form looks like.
