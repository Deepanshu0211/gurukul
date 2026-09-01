-- 017 — The Saturday morning assembly sheet.
--
-- WHY
-- The school already has this report. It is a ruled page in a spiral book,
-- filled in by hand every Saturday morning and signed by the Assembly
-- Co-ordinator, the MOD and the Principal. Twelve rows — three grade bands
-- crossed with four houses — and eight numbers each, which somebody adds up
-- twice because the totals have to reconcile before the Principal signs.
--
-- Digitising the checkpoint but still filling this in by hand would mean the
-- same children counted twice, in two places, with no guarantee the answers
-- match. So the sheet is generated from the marks, in the school's own
-- layout, and what changes is only who does the arithmetic.
--
-- WHAT THIS IS
--  1. `houses` — the four houses, in the order the printed form lists them.
--  2. `students.house` — which house a child is in. NULLABLE and unset: the
--     app has no house data yet (see the note at the foot of this file).
--  3. `saturday_report()` — one row per printed row, counts only.
--
-- The counts group `attendance_detail` (009), so this sheet can no more
-- disagree with the register than the headcount in 011 can.
--
-- SECURITY
-- `security invoker`, like 009 and 011: RLS decides which marks are counted.

-- ── HOUSES ──────────────────────────────────────────────────────────────────
-- A table rather than a check constraint or a hardcoded list, because the
-- printed form has to show all four rows on a morning when one of them is
-- empty, and because renaming a house should not be a code change.
create table if not exists houses (
  name       text primary key,
  sort_order int  not null
);

insert into houses (name, sort_order) values
  ('Vrindavan', 1),
  ('Goverdhan', 2),
  ('Nandgaon',  3),
  ('Barsana',   4)
on conflict (name) do update set sort_order = excluded.sort_order;

alter table houses enable row level security;

drop policy if exists houses_read        on houses;
drop policy if exists houses_write_admin on houses;

create policy houses_read on houses
  for select to authenticated using (true);
create policy houses_write_admin on houses
  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- Nullable on purpose. A NOT NULL with a default would put every child in
-- Vrindavan and print a sheet that looks right and is wrong.
alter table students add column if not exists house text references houses(name);

create index if not exists students_house_idx on students (house) where active;

-- ── THE SHEET, AS COUNTS ────────────────────────────────────────────────────
-- Column names map to the printed form:
--
--   res / day_scholars / strength   Res, Day, Total
--   res_present / day_present       Res P, Day P
--   res_absent  / day_absent        Res A, Day A
--   sick                            Sick
--   not_reported                    Not Reported (Home) / GN
--
-- Two extra numbers the paper form has no column for, printed as footnotes
-- rather than columns so the layout stays the one people already know:
--
--   on_duty    children marked Activity or Self study. On the paper sheet
--              these are written into Res A with "on duty" pencilled above
--              it. This app knows the difference, and Absent here means
--              nobody knows where the child is — so they are counted as
--              present and the number is stated separately instead.
--   unmarked   in the register but with no mark at this checkpoint, i.e. the
--              duty was never submitted. Zero on a normal morning. When it is
--              not zero the row does not add up to Total, and the sheet has
--              to say so rather than quietly balance itself.
--
-- The six printed buckets partition the strength exactly, which is the one
-- property that makes the sheet signable: Res P + Day P + Res A + Day A +
-- Sick + Not Reported + unmarked = Total, always.
create or replace function saturday_report(
  p_day        date default current_date,
  p_checkpoint text default 'morning'
)
returns table (
  band         text,
  band_order   int,
  house        text,
  house_order  int,
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
  unmarked     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  -- Mirrors BANDS in src/lib/duties.js. Duplicated across the language
  -- boundary rather than derived: if the school ever moves grade 5 into
  -- Middle, both have to change, and a sheet that banded students
  -- differently from the duty that marked them would be worse than either.
  with bands (band, band_order, lo, hi) as (
    values ('Primary', 1, 2, 5),
           ('Middle',  2, 6, 8),
           ('Senior',  3, 9, 12)
  ),

  -- Every row the printed form has, empty or not — plus one for children
  -- with no house yet, so the totals still reconcile while the house data is
  -- being filled in.
  slots as (
    select b.band, b.band_order, b.lo, b.hi, h.name as house, h.sort_order as house_order
      from bands b cross join houses h
    union all
    select b.band, b.band_order, b.lo, b.hi, null::text, 99
      from bands b
     where exists (
       select 1 from students s
        where s.active and s.house is null and s.grade between b.lo and b.hi
     )
  ),

  -- Who the sheet counts, before any mark is considered. Strength comes from
  -- the register, not from who happens to have been marked: an unsubmitted
  -- checkpoint must print the class sizes with blank counts, not a page of
  -- zeros that reads like an empty school.
  roll as (
    select s.admission_no,
           s.grade,
           s.house,
           -- Matches isResidential() in src/lib/duties.js: everything except
           -- an explicit Day Scholar is residential, Day Boarding included.
           -- One definition of "Res", so this sheet's Res column and the
           -- residential checkpoints cover the same children.
           (s.stype <> 'Day Scholar') as residential
      from students s
     where s.active and s.grade between 2 and 12
  ),

  -- `marked` separates "present" (a row whose status is null) from "never
  -- marked" (no row at all). Both look like a null status after a left join,
  -- and conflating them is how an unsubmitted checkpoint prints a full house.
  marks as (
    select ad.admission_no, ad.status, true as marked
      from attendance_detail ad
     where ad.day = p_day
       and ad.checkpoint_id = p_checkpoint
  )

  select
    sl.band,
    sl.band_order,
    sl.house,
    sl.house_order,
    -- count(r.admission_no), never count(*): an empty slot still produces one
    -- all-null row from the left join, and count(*) would call it a student.
    count(r.admission_no) filter (where r.residential),
    count(r.admission_no) filter (where not r.residential),
    count(r.admission_no),
    count(*) filter (where r.residential     and m.marked and (m.status is null or m.status in ('V','Y'))),
    count(*) filter (where not r.residential and m.marked and (m.status is null or m.status in ('V','Y'))),
    count(*) filter (where r.residential     and m.status = 'A'),
    count(*) filter (where not r.residential and m.status = 'A'),
    count(*) filter (where m.status = 'S'),
    count(*) filter (where m.status in ('H','G','O')),
    count(*) filter (where m.status in ('V','Y')),
    count(*) filter (where r.admission_no is not null and m.marked is null)
  from slots sl
  left join roll r
    on r.grade between sl.lo and sl.hi
   -- `is not distinct from` so the unassigned slot joins the null houses;
   -- plain `=` is null when both sides are null and would drop every one.
   and r.house is not distinct from sl.house
  left join marks m on m.admission_no = r.admission_no
  group by sl.band, sl.band_order, sl.house, sl.house_order
  order by sl.band_order, sl.house_order;
$$;

grant execute on function saturday_report(date, text) to authenticated;

-- ── FILLING IN THE HOUSES ───────────────────────────────────────────────────
-- Nothing above assigns anybody. The register the app imported
-- (docs/data/students_415.csv) has no house column, and inventing one would
-- produce a sheet that adds up and tells the Principal the wrong thing about
-- where a child was. Until the school supplies the mapping, every student
-- falls into the "Not yet assigned" row on the printed sheet, whose numbers
-- are still correct — they are just not split four ways.
--
-- To load it, once that list exists:
--   update students set house = 'Vrindavan' where admission_no in (...);
-- or, if the school sends a spreadsheet, import it to a temp table and:
--   update students s set house = t.house from house_import t
--    where t.admission_no = s.admission_no;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- With a coordinator token, on a day whose morning checkpoint was submitted:
--   select * from saturday_report('2026-08-08');
--   -> 12 rows (plus one null-house row while houses are unassigned)
--   -> for every row:
--        strength = res + day_scholars
--        strength = res_present + day_present + res_absent + day_absent
--                   + sick + not_reported + unmarked
--   If the second identity fails, a status code exists that none of the six
--   buckets claims. Find it before anyone signs a sheet built on it:
--     select code from status_types
--      where code not in ('A','S','H','G','O','V','Y');
--
-- With a plain teacher token the same call must return the same numbers
-- (005 made attendance school-wide readable). Fewer means RLS is tighter than
-- 005 describes and the printed sheet would under-count silently.
