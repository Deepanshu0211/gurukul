-- seed-saturday.sql
--
-- Gives you a Saturday you can actually work: the twelve house duties of the
-- morning assembly, so a house teacher can mark their own house and the
-- assembly sheet has something real to count.
--
-- Run AFTER 017, 018, 019 and seed-houses-test.sql (or the school's real house
-- list). Safe to run as often as you like — it targets one date and replaces
-- that date's assembly duties each time.
--
-- ⚠ TEST DATA. It rosters the seeded test staff onto the twelve houses. On a
-- live database, change the staff ids in HOUSE_TEACHERS below to the real
-- house teachers before running.
--
-- ── WHY TWELVE DUTIES ───────────────────────────────────────────────────────
-- Saturday is not marked class by class. The school assembles by house, and
-- the printed register says so: twelve rows, three grade bands crossed with
-- four houses, each with a House Teacher column beside it because that group
-- is one person's to answer for. So there are twelve duties, one per row, and
-- each house teacher opens the app and sees their own — about thirty-five
-- children, not four hundred.
--
-- The sheet does not read these duties. `saturday_report()` groups children by
-- their OWN band and house from the register, so the twelve duties and the
-- twelve printed rows agree because both come from the same student records —
-- not because either is defined in terms of the other.

begin;

-- The Saturday just gone — the same day the app's print sheet defaults to, so
-- what you seed is what you see. Edit this one line to target another date.
--
-- `on commit drop` is load-bearing, not tidiness: a SQL editor holds one
-- session open across runs, so without it the second run of this file fails
-- with 'relation "target" already exists' and nothing gets seeded.
create temp table target on commit drop as
select (school_today() - ((extract(dow from school_today())::int + 1) % 7))::date as day;

-- Who answers for each house. One teacher per house across all three bands,
-- which is the closest the seeded test accounts get to a real house rota —
-- the real school has twelve house teachers, one per row of the form.
create temp table house_teachers (house text, staff_id text) on commit drop;
insert into house_teachers values
  ('Vrindavan', 't1'),   -- Krishna Saha Mt
  ('Goverdhan', 't2'),   -- Ajay Solanki Pr
  ('Nandgaon',  'c1'),   -- Ashram Coordinator
  ('Barsana',   'c2');   -- MOD

-- Replace this date's assembly duties rather than adding to them, so running
-- twice does not leave a teacher looking at two roll calls for one house.
-- Attendance goes first: it references duties.
delete from attendance
 where duty_id in (
   select d.id from duties d, target t
    where d.day = t.day and d.checkpoint_id = 'morning' and d.id like 'sat-%'
 );
delete from duties d using target t
 where d.day = t.day and d.checkpoint_id = 'morning' and d.id like 'sat-%';

-- Twelve duties: every band crossed with every house, in the order the
-- printed form lists them. `scope` is null rather than 'res' — Saturday
-- morning assembly is the whole school, day scholars included, which is
-- exactly why the sheet has separate Res and Day columns.
insert into duties (id, checkpoint_id, day, group_label, band, house, scope, staff_id, state)
select 'sat-' || lower(b.band) || '-' || lower(h.name),
       'morning',
       t.day,
       b.band || ' ' || h.name,
       b.band,
       h.name,
       null,
       ht.staff_id,
       'pending'
  from target t
 cross join (values ('Primary', 1), ('Middle', 2), ('Senior', 3)) as b(band, band_order)
 cross join houses h
  join house_teachers ht on ht.house = h.name
 order by b.band_order, h.sort_order;

commit;

-- ── WHAT WAS SEEDED, AND WHO IS IN IT ───────────────────────────────────────
-- The group size beside each duty is resolved the same way the app resolves
-- it: band narrows by grade, house narrows by house. If any of these read 0,
-- the students have no houses yet — run seed-houses-test.sql (or load the
-- school's real list) and run this file again.
select d.group_label,
       d.staff_id,
       d.state,
       (select count(*) from students s
         where s.active
           and s.house = d.house
           and s.grade between case d.band when 'Primary' then 2 when 'Middle' then 6 else 9 end
                           and case d.band when 'Primary' then 5 when 'Middle' then 8 else 12 end
       ) as students_in_group
  from duties d
 where d.checkpoint_id = 'morning' and d.id like 'sat-%'
 order by case d.band when 'Primary' then 1 when 'Middle' then 2 else 3 end,
          (select sort_order from houses where name = d.house);

-- ── DO THE TWELVE GROUPS COVER THE SCHOOL? ──────────────────────────────────
-- The one property that has to hold: every child in grades 2-12 is in exactly
-- one group. A child in none is marked by nobody and prints in the sheet's
-- unmarked column; a child in two is counted twice.
select (select count(*) from students where active and grade between 2 and 12) as in_register,
       (select count(*) from students s
         where s.active and s.grade between 2 and 12 and s.house is not null)  as in_some_group,
       case when (select count(*) from students
                   where active and grade between 2 and 12 and house is null) = 0
            then 'Good: every child is in exactly one house group'
            else (select count(*)::text from students
                   where active and grade between 2 and 12 and house is null)
                 || ' children have no house and would be marked by nobody'
       end                                                                     as verdict;

-- ── WHICH DAY THE APP WILL ACTUALLY SHOW ────────────────────────────────────
-- Seeding a Saturday is not the same as seeing it. The Duties tab asks for
-- TODAY, and only if today has no duties at all does `fetchDuties` fall back
-- to the most recent day that has some (src/lib/duties.js — a stand-in for the
-- nightly job that does not exist yet). So if anything is still dated today
-- from an earlier test run, the app shows that and the Saturday stays
-- invisible, with nothing on screen to explain why.
select case
         when exists (select 1 from duties where day = school_today())
           then school_today()
         else (select max(day) from duties)
       end                                                as app_will_show,
       (select max(day) from duties where id like 'sat-%') as saturday_seeded,
       case
         when exists (select 1 from duties where day = school_today())
              and school_today() <> (select max(day) from duties where id like 'sat-%')
           then 'Duties dated today are in the way — see the optional block below'
         when (select max(day) from duties) = (select max(day) from duties where id like 'sat-%')
           then 'Good: the app will open on the seeded Saturday'
         else 'Something later than the Saturday exists — see the optional block below'
       end                                                as verdict;

-- ── OPTIONAL: CLEAR THE WAY ─────────────────────────────────────────────────
-- Only if the verdict above says something is in the way. This PARKS every
-- duty dated after the seeded Saturday by moving it a year back, rather than
-- deleting it — the attendance rows that reference those duties survive, and
-- you can move them forward again when you are done.
--
--   update duties set day = day - interval '1 year'
--    where day > (select max(day) from duties where id like 'sat-%')
--      and id not like 'sat-%';
--
-- To undo:
--   update duties set day = day + interval '1 year'
--    where day < school_today() - interval '300 days' and id not like 'sat-%';

-- ── THEN, IN THE APP ────────────────────────────────────────────────────────
--   1. Log in as t1 (krishna.saha@gurukula.org) — the Vrindavan house teacher.
--   2. Duties tab. Three duties: "Primary Vrindavan", "Middle Vrindavan",
--      "Senior Vrindavan" — their house, one row of the form each. There is no
--      separate Saturday screen; a house roll call is marked exactly like any
--      other checkpoint, which is the point.
--   3. Open one and submit. Everyone defaults to Present; touch the exceptions
--      only. Mark a few Absent and one Sick so the sheet has something in its
--      columns other than a wall of P.
--   4. Log in as a coordinator, Dashboard, print icon, "Saturday assembly
--      sheet". The row for that house carries the marks you just submitted;
--      the eleven you did not mark read as unmarked, and the sheet says so.
