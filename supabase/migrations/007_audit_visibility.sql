-- 007 — What the audit log records, and who may read it.
--
-- WHY
-- 006 introduced `audit_log` but recorded only one kind of event (an override)
-- and showed it only to the roles that can perform one. That leaves the two
-- questions a teacher actually has unanswerable BY the teacher:
--
--   * "Did my submission go through, and at what time?"
--   * "Who changed my attendance, and who marked my checkpoint for me?"
--
-- A record of what was done to someone's work, readable by everyone except
-- the person it was done to, is a strange thing to build. This migration logs
-- submissions and reassignments as well as overrides, and lets a teacher read
-- the entries that concern them — their own actions, and anyone else's action
-- on their duties. It does NOT let them read the rest of the school's.
--
-- WHAT DOES NOT CHANGE
--   * Oversight roles still read everything.
--   * The log is still written only by SECURITY DEFINER triggers. No client of
--     any role can insert, amend or delete an entry.
--
-- TESTING (do not skip — see the header of 002):
--   1. Teacher A submits a checkpoint -> one 'duty_submitted' row, actor = A
--   2. Teacher B submits a checkpoint rostered to A (cover marking)
--        -> 'duty_submitted', actor = B, subject_id = A
--        -> A can read it; a THIRD teacher C cannot
--   3. Coordinator overrules A's record -> 'attendance_override', subject_id = A
--        -> A can read it
--   4. Teacher C selects from audit_log -> only rows naming C
--   5. Any token, insert/update/delete on audit_log -> must FAIL

-- ── WHO EACH ENTRY CONCERNS ─────────────────────────────────────────────────
-- `actor_id` is who did it. These two are who it was done TO, which is what
-- makes "show me what happened to my duties" answerable without joining back
-- through duties on every row — and, more importantly, expressible as an RLS
-- policy that stays cheap.
alter table audit_log add column if not exists subject_id text references staff(id);
alter table audit_log add column if not exists related_id text references staff(id);

create index if not exists audit_log_actor_idx   on audit_log (actor_id);
create index if not exists audit_log_subject_idx on audit_log (subject_id);
create index if not exists audit_log_related_idx on audit_log (related_id);

-- ── OVERRIDES NOW NAME WHOSE RECORD WAS CHANGED ─────────────────────────────
create or replace function log_attendance_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev         text;
  parent_state text;
  parent_owner text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  prev := case when tg_op = 'UPDATE' then old.status else null end;

  select state, submitted_by into parent_state, parent_owner
    from duties where id = new.duty_id;

  -- The original submission writes every student's row while the duty is
  -- still pending, so it never reaches this branch. Anything after that is a
  -- correction of somebody's finished work.
  if parent_state is distinct from 'submitted' then
    return new;
  end if;

  insert into audit_log
    (actor_id, action, duty_id, admission_no, old_status, new_status, subject_id)
  values
    (my_staff_id(), 'attendance_override', new.duty_id, new.admission_no,
     prev, new.status, parent_owner);

  return new;
end;
$$;

-- ── SUBMISSIONS AND REASSIGNMENTS ───────────────────────────────────────────
-- Both are events done to a teacher's duty by somebody who may not be them,
-- and neither was recorded anywhere before.
create or replace function log_duty_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.state is distinct from 'submitted' and new.state = 'submitted' then
    -- subject_id is the ROSTERED teacher. When it differs from actor_id the
    -- entry is a cover marking, and that difference is the whole record of it.
    insert into audit_log (actor_id, action, duty_id, subject_id)
    values (new.submitted_by, 'duty_submitted', new.id, new.staff_id);
  end if;

  if new.staff_id is distinct from old.staff_id then
    insert into audit_log (actor_id, action, duty_id, subject_id, related_id)
    values (my_staff_id(), 'duty_reassigned', new.id, old.staff_id, new.staff_id);
  end if;

  return new;
end;
$$;

drop trigger if exists duties_log_events on duties;
create trigger duties_log_events
  after update on duties
  for each row execute function log_duty_events();

-- ── WHO MAY READ WHAT ───────────────────────────────────────────────────────
-- Oversight sees the school. Everyone else sees only entries they are named
-- in: what they did, and what was done to their duties. There is still no
-- insert, update or delete policy — the triggers above run as the table owner
-- and are the only writers.
drop policy if exists audit_log_select on audit_log;

create policy audit_log_select on audit_log
  for select to authenticated
  using (
    can_override()
    or actor_id   = my_staff_id()
    or subject_id = my_staff_id()
    or related_id = my_staff_id()
  );
