-- reset-test-data.sql
--
-- Puts the pilot day back to a clean state so someone can test from scratch:
-- clears all attendance, clears the alert resolutions and the audit trail that
-- went with it, sets every duty back to pending and dated today, and restores
-- the seed assignments (they drift as you test reassignment).
--
-- Leaves alone: students, staff, logins, profile photos, checkpoints.
-- Safe to run as often as you like.
--
-- ⚠ TEST DATA ONLY. This deletes the audit trail, which on a live system is
-- the record of who did what to a child's attendance. Never run it against a
-- database the school is using.

begin;

-- Triggers off for the duration. Resetting `staff_id` back to its seed value
-- looks exactly like a reassignment to `duties_log_events`, so without this
-- every reset would write a fistful of spurious 'duty_reassigned' rows —
-- attributed to nobody, since `my_staff_id()` is null in the SQL editor.
alter table duties disable trigger user;
alter table attendance disable trigger user;

-- 1. Every mark from previous test runs.
delete from attendance;

-- 2. The resolutions that answered those marks.
--    Critical, not tidiness: a resolution is keyed on (duty, student), and
--    those ids are stable across a reset. Left behind, the next test run
--    would mark a child absent and find the alert already resolved by a
--    remark from the previous run.
delete from alert_resolutions;

-- 3. The trail of the run that just ended.
delete from audit_log;

-- 4. Duties back to unsubmitted, dated today so they appear in the app.
--    `staff_id` is reset too, since testing reassignment moves duties around.
--    `corrected_by` likewise — otherwise a duty that was overruled during
--    testing still shows "Overruled by …" on a record that no longer exists.
update duties set
  day          = current_date,
  state        = 'pending',
  submitted_by = null,
  submitted_at = null,
  corrected_by = null,
  corrected_at = null,
  staff_id     = case id
                   when 'mang'      then 'c1'   -- Ashram Coordinator
                   when 'bfast-sr'  then 't2'   -- Ajay Solanki Pr
                   when 'morn-4A'   then 't1'   -- Krishna Saha Mt
                   when 'morn-9B'   then 't2'
                   when 'lunch-mid' then 'c1'
                   when 'night-sr'  then 't2'
                   else staff_id
                 end;

alter table duties enable trigger user;
alter table attendance enable trigger user;

commit;

-- Check — all four should be true:
select 'duties pending and dated today' as check,
       not exists (select 1 from duties where state <> 'pending' or day <> current_date) as ok
union all select 'no attendance',        not exists (select 1 from attendance)
union all select 'no resolutions',       not exists (select 1 from alert_resolutions)
union all select 'no audit entries',     not exists (select 1 from audit_log)
union all select 'no corrections left',  not exists (select 1 from duties where corrected_by is not null)
order by 1;
