-- reset-test-data.sql
--
-- Puts the pilot day back to a clean state so someone can test from scratch:
-- clears all attendance, sets every duty back to pending and dated today, and
-- restores the seed assignments (they drift as you test reassignment).
--
-- Leaves alone: students, staff, logins, profile photos, checkpoints.
-- Safe to run as often as you like.

begin;

-- 1. Every mark from previous test runs.
delete from attendance;

-- 2. Duties back to unsubmitted, dated today so they appear in the app.
--    `staff_id` is reset too, since testing reassignment moves duties around.
update duties set
  day          = current_date,
  state        = 'pending',
  submitted_by = null,
  submitted_at = null,
  staff_id     = case id
                   when 'mang'      then 'c1'   -- Ashram Coordinator
                   when 'bfast-sr'  then 't2'   -- Ajay Solanki Pr
                   when 'morn-4A'   then 't1'   -- Krishna Saha Mt
                   when 'morn-9B'   then 't2'
                   when 'lunch-mid' then 'c1'
                   when 'night-sr'  then 't2'
                   else staff_id
                 end;

commit;

-- Check:
--   select id, day, staff_id, state from duties order by id;
--   select count(*) from attendance;   -- expect 0
