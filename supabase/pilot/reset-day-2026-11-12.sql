-- reset-day-2026-11-12.sql
--
-- Undoes everything that happened on 12 Nov 2026 (school timezone, Asia/Kolkata):
--   * staff created that day (+ their logins, temp passwords, requests, resets)
--   * all attendance + duty submissions for that day, alert resolutions
--   * audit log entries, gate sign-outs/ins, notifications, holidays declared
--
-- Run manually in the Supabase SQL Editor as postgres.
-- STEP 1: run the PREVIEW block alone and check the counts/names.
-- STEP 2: run the RESET block (it is one transaction; any error rolls it all back).
-- Staff are deleted only if nothing OTHER than that day's activity points at them.
-- ⚠ Destructive and not reversible except via a Supabase backup. Take one first.

-- ═══ PREVIEW (read-only) ════════════════════════════════════════════════════
with p as (select date '2026-11-12' as d),
new_staff as (
  select s.id, s.name, s.role, s.email
  from staff s
  left join auth.users u on u.id = s.auth_user_id
  cross join p
  where (u.created_at at time zone 'Asia/Kolkata')::date = p.d
     or s.id in (select staff_id from staff_temp_passwords t
                 where (t.issued_at at time zone 'Asia/Kolkata')::date = p.d)
)
select 'staff created that day' as what, count(*)::text as n, string_agg(name || ' (' || id || ')', ', ') as detail from new_staff
union all select 'duties for that day',        count(*)::text, null from duties, p where day = p.d
union all select 'attendance rows',            count(*)::text, null from attendance a join duties d on d.id = a.duty_id, p where d.day = p.d
union all select 'alert resolutions',          count(*)::text, null from alert_resolutions r, p where (r.resolved_at at time zone 'Asia/Kolkata')::date = p.d
union all select 'audit_log entries',          count(*)::text, null from audit_log l, p where (l.at at time zone 'Asia/Kolkata')::date = p.d
union all select 'gate sign-outs / ins',       count(*)::text, null from student_leave l, p where l.out_day = p.d or l.back_day = p.d
union all select 'notifications',              count(*)::text, null from notifications n, p where (n.created_at at time zone 'Asia/Kolkata')::date = p.d
union all select 'staff requests',             count(*)::text, null from staff_requests r, p where (r.requested_at at time zone 'Asia/Kolkata')::date = p.d
union all select 'holidays declared',          count(*)::text, null from holidays h, p where (h.declared_at at time zone 'Asia/Kolkata')::date = p.d
union all select 'duty_defaults created',      count(*)::text, null from duty_defaults x, p where (x.created_at at time zone 'Asia/Kolkata')::date = p.d;

-- ═══ RESET ══════════════════════════════════════════════════════════════════
begin;

-- Triggers off so the reset doesn't write fresh audit rows about itself.
alter table duties     disable trigger user;
alter table attendance disable trigger user;

create temp table _day  on commit drop as select date '2026-11-12' as d;

create temp table _new_staff on commit drop as
select s.id
from staff s
left join auth.users u on u.id = s.auth_user_id
cross join _day
where (u.created_at at time zone 'Asia/Kolkata')::date = _day.d
   or s.id in (select staff_id from staff_temp_passwords t
               where (t.issued_at at time zone 'Asia/Kolkata')::date = _day.d);

create temp table _new_auth on commit drop as
select auth_user_id as id from staff
where id in (select id from _new_staff) and auth_user_id is not null;

-- 1. Gate: notifications first (they reference student_leave), then the leave rows.
delete from notification_reads where notification_id in
  (select n.id from notifications n, _day where (n.created_at at time zone 'Asia/Kolkata')::date = _day.d);
delete from notifications n using _day
  where (n.created_at at time zone 'Asia/Kolkata')::date = _day.d;

-- Children signed OUT before that day and back IN on it: reopen the leave.
update student_leave set back_day = null, in_at = null, in_by = null
  from _day where back_day = _day.d and out_day < _day.d;
delete from student_leave using _day where out_day = _day.d;

-- 2. Attendance, resolutions and submissions for that day's duties.
delete from alert_resolutions r using duties d, _day
  where r.duty_id = d.id and d.day = _day.d;
delete from alert_resolutions r using _day
  where (r.resolved_at at time zone 'Asia/Kolkata')::date = _day.d;
delete from attendance a using duties d, _day
  where a.duty_id = d.id and d.day = _day.d;
update duties set state = 'pending', submitted_by = null, submitted_at = null,
                  corrected_by = null, corrected_at = null
  from _day where duties.day = _day.d;

-- 3. The audit trail for that day.
delete from audit_log l using _day
  where (l.at at time zone 'Asia/Kolkata')::date = _day.d;

-- 4. Holidays and roster defaults created that day.
delete from holidays h using _day
  where (h.declared_at at time zone 'Asia/Kolkata')::date = _day.d;
delete from duty_defaults x using _day
  where (x.created_at at time zone 'Asia/Kolkata')::date = _day.d;

-- 5. Staff created that day. Their duties go back to a coordinator first.
update duties set staff_id = (select id from staff where role = 'coordinator' and active
                              and id not in (select id from _new_staff) order by id limit 1)
  where staff_id in (select id from _new_staff);
update duties set submitted_by = null where submitted_by in (select id from _new_staff);
update duties set corrected_by = null where corrected_by in (select id from _new_staff);
update duty_defaults set staff_id = null where staff_id in (select id from _new_staff);
update duty_defaults set created_by = null where created_by in (select id from _new_staff);
update holidays set declared_by = null where declared_by in (select id from _new_staff);
update student_leave set out_by = null where out_by in (select id from _new_staff);
update student_leave set in_by  = null where in_by  in (select id from _new_staff);
update notifications set actor = null where actor in (select id from _new_staff);
update staff_requests set decided_by = null where decided_by in (select id from _new_staff);
update staff_temp_passwords set issued_by = null where issued_by in (select id from _new_staff);
update password_resets set issued_by = null where issued_by in (select id from _new_staff);
update audit_log set actor_id = null where actor_id in (select id from _new_staff);
delete from notification_reads  where staff_id in (select id from _new_staff);
delete from password_resets     where staff_id in (select id from _new_staff);
delete from staff_temp_passwords where staff_id in (select id from _new_staff);
delete from staff_requests r using _day
  where (r.requested_at at time zone 'Asia/Kolkata')::date = _day.d
     or r.auth_user_id in (select id from _new_auth);
delete from alert_resolutions where resolved_by in (select id from _new_staff);
delete from staff where id in (select id from _new_staff);

-- 6. Their logins. Remove this line to keep the auth accounts.
delete from auth.users where id in (select id from _new_auth);

alter table duties     enable trigger user;
alter table attendance enable trigger user;

commit;

-- Check: all should be true.
select 'no attendance for the day' as check,
       not exists (select 1 from attendance a join duties d on d.id = a.duty_id where d.day = date '2026-11-12') as ok
union all select 'no audit entries that day',
       not exists (select 1 from audit_log where (at at time zone 'Asia/Kolkata')::date = date '2026-11-12')
union all select 'no submitted duties that day',
       not exists (select 1 from duties where day = date '2026-11-12' and state <> 'pending');
