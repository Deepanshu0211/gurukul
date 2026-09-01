-- seed-houses-test.sql
--
-- ⚠⚠ TEST DATA. THIS INVENTS WHICH HOUSE EACH CHILD IS IN. ⚠⚠
--
-- The school's real house list has not been supplied, and the register the app
-- imported (docs/data/students_415.csv) has no house column. Without houses,
-- Saturday's twelve house duties resolve to twelve groups of nobody, so there
-- is nothing to mark and nothing to print — which makes the whole flow
-- impossible to try.
--
-- This fills the gap with a balanced, arbitrary assignment SO THAT THE FLOW
-- CAN BE WALKED. It is not the school's data and must never be treated as it:
-- a sheet built on this tells the Principal a child was at assembly with a
-- house they are not in. Replace it the day the real list arrives.
--
-- Two safety properties, both deliberate:
--
--   * It only ever fills houses that are NULL. Run it after the real list has
--     been loaded and it touches nobody who already has a house — so it can
--     never overwrite real data with invented data.
--   * It is undone by one statement (at the foot of this file).
--
-- Requires 017 (which created `houses` and `students.house`).

begin;

-- ntile(4) within each band, so every band splits four ways evenly and the
-- twelve groups come out roughly equal — about 35 children each, which is a
-- roll call one person can finish. Ordered by admission_no so re-running on a
-- restored database produces the same assignment rather than a new one.
with banded as (
  select admission_no,
         case when grade <= 5 then 1 when grade <= 8 then 2 else 3 end as band_order
    from students
   where active and grade between 2 and 12 and house is null
),
ranked as (
  select admission_no,
         ntile(4) over (partition by band_order order by admission_no) as bucket
    from banded
)
update students s
   set house = h.name
  from ranked r
  join houses h on h.sort_order = r.bucket
 where s.admission_no = r.admission_no;

commit;

-- What it did. Every cell should hold roughly a twelfth of the school, and no
-- child in grades 2-12 should be left without a house.
select case when grade <= 5 then 'Primary' when grade <= 8 then 'Middle' else 'Senior' end as band,
       count(*) filter (where house = 'Vrindavan') as vrindavan,
       count(*) filter (where house = 'Goverdhan') as goverdhan,
       count(*) filter (where house = 'Nandgaon')  as nandgaon,
       count(*) filter (where house = 'Barsana')   as barsana,
       count(*) filter (where house is null)       as no_house,
       count(*)                                    as total
  from students
 where active and grade between 2 and 12
 group by 1
 order by min(case when grade <= 5 then 1 when grade <= 8 then 2 else 3 end);

-- ── UNDO ────────────────────────────────────────────────────────────────────
-- Clears every house, invented and real alike. Run it before loading the
-- school's real list if you want a clean slate:
--   update students set house = null;
--
-- To replace only the invented ones once the real list exists, load the real
-- list first into a temp table and:
--   update students s set house = t.house from house_import t
--    where t.admission_no = s.admission_no;
