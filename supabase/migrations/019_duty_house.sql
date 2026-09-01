-- 019 — House duties: how Saturday is actually marked.
--
-- WHY
-- On a weekday, morning attendance is taken class by class. On Saturday the
-- school assembles by HOUSE, and the register reflects it: twelve rows, three
-- grade bands crossed with four houses, and a House Teacher column beside each
-- one because that group is somebody's to answer for.
--
-- Until now a duty could say "class 4 A" (class_key), "Middle school" (band,
-- added in 018) or "residential only" (scope). None of those can express
-- "Middle school, Nandgaon house" — so the Saturday assembly could only be
-- marked in three band-sized lumps that matched nothing on the paper form, and
-- the person who signs for Middle Nandgaon had no duty of their own to mark.
--
-- WHAT THIS IS
-- One column, and the composition rule that goes with it: `band` narrows by
-- grade, `house` narrows by house, and the two together are a row of the
-- printed sheet. `src/lib/duties.js` applies them in exactly that order.
--
-- DEPENDS ON 017, which created `houses` and `students.house`. A house duty
-- resolves against `students.house`, so it covers nobody until the register
-- has houses in it — see the note at the foot of 017.
--
-- NOTE ON THE SHEET
-- `saturday_report()` does NOT read this column, and deliberately so. It
-- groups children by their own band and house from the register, not by
-- whichever duty happened to mark them. So the twelve duties below and the
-- twelve printed rows line up because both derive from the same student
-- records — not because one is defined in terms of the other. A child moved
-- between houses cannot end up counted in one row and marked in another.
alter table duties add column if not exists house text references houses(name);

-- A foreign key, not a free-text column: a duty for house 'Vrindavana' would
-- resolve to an empty group and read on screen as a roll call with nobody in
-- it, which looks like the app failing rather than like a typo.
create index if not exists duties_house_idx on duties (day, house);

comment on column duties.house is
  'Narrows a duty to one house, composed with band. Saturday assembly is band x house.';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- The composition rule, checked against the register itself. Every band-house
-- duty for a day must cover each child in grades 2-12 exactly once:
--
--   select count(*) from students where active and grade between 2 and 12;
--   -- must equal:
--   select sum(n) from (
--     select count(s.admission_no) as n
--       from duties d
--       join students s
--         on s.active
--        and s.house = d.house
--        and s.grade between case d.band when 'Primary' then 2
--                                        when 'Middle'  then 6 else 9 end
--                        and case d.band when 'Primary' then 5
--                                        when 'Middle'  then 8 else 12 end
--      where d.checkpoint_id = 'morning' and d.house is not null
--      group by d.id
--   ) x;
--
-- If the second is smaller, some children have no house yet and are in no
-- group at all — they would be marked by nobody and print in the sheet's
-- unmarked count. Find them:
--
--   select admission_no, name, grade from students
--    where active and grade between 2 and 12 and house is null;
--
-- A house whose name does not exist must be refused outright:
--   update duties set house = 'Vrindavana' where id = 'sat-middle-nandgaon';
--   -- must FAIL on the foreign key, not silently empty the group.
