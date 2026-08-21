-- 008 — A complete record of what happens, and who may read which part of it.
--
-- WHY
-- Two gaps. First, `audit_log` recorded only what happened to attendance, so
-- "who changed this phone number", "who added this student" and "who signed
-- in" were unanswerable. Second, resolving a safety alert wrote nothing at
-- all: the remark lived in React state and was gone on reload, which for the
-- one feature that exists to account for a missing child is the worst place
-- in the app to lose data (SRS F4).
--
-- WHAT CHANGES
--   * `audit_log` gains a severity, and reading is tiered: an administrator
--     sees everything; coordinators and the MOD see the operational record
--     (attendance, cover, reassignment, alerts) without the routine noise of
--     everyone's profile edits and sign-ins; everyone sees their own actions
--     and anything done to them.
--   * `alert_resolutions` persists the remark. The ALERT itself is still
--     derived from attendance — `domain/alerts.js` computes it, so it can
--     never disagree with the marks. Only the resolution is state, which is
--     why this table stores a resolution and not an alert.
--   * `old_status`/`new_status` become the general `field`/`old_value`/
--     `new_value`, so one row shape describes a status change and a phone
--     number change alike. Existing rows are backfilled before the old
--     columns are dropped.
--
-- TESTING (do not skip — see the header of 002):
--   1. Teacher changes their phone -> 'profile_updated', severity 'routine'
--        -> the teacher can read it; a coordinator CANNOT; an admin can
--   2. Coordinator resolves an alert -> 'alert_resolved', severity
--      'operational' -> coordinator, admin and the marking teacher can read it
--   3. Resolve the same alert twice -> one row, remark updated, second audit
--      entry recorded
--   4. Teacher inserts into alert_resolutions for a duty that is not theirs
--        -> must FAIL
--   5. Any token, insert into audit_log directly -> must FAIL

-- ── ONE ROW SHAPE FOR EVERY KIND OF CHANGE ──────────────────────────────────
alter table audit_log add column if not exists field     text;
alter table audit_log add column if not exists old_value text;
alter table audit_log add column if not exists new_value text;

-- Backfill before dropping, so the overrides already recorded survive.
--
-- Guarded and run through EXECUTE because this file must survive being run
-- twice. A plain UPDATE here referred to columns that the two statements
-- below drop, so a second run failed with 42703 before reaching anything
-- else. Dynamic SQL inside an untaken branch is never planned, so when the
-- columns are already gone this is simply a no-op.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'audit_log'
      and column_name  = 'old_status'
  ) then
    execute $mig$
      update audit_log
         set field     = coalesce(field, 'status'),
             old_value = coalesce(old_value, old_status),
             new_value = coalesce(new_value, new_status)
       where action = 'attendance_override'
    $mig$;
  end if;
end $$;

alter table audit_log drop column if exists old_status;
alter table audit_log drop column if exists new_status;

-- 'routine' is the everyday administrative traffic — sign-ins, profile edits.
-- 'operational' is anything touching a child's attendance or safety. The
-- split exists so the MOD's log stays readable: a coordinator scanning for
-- who overruled an absence should not be wading through photo changes.
alter table audit_log add column if not exists severity text not null default 'operational';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_log_severity_check') then
    alter table audit_log add constraint audit_log_severity_check
      check (severity in ('routine','operational'));
  end if;
end $$;

create index if not exists audit_log_severity_idx on audit_log (severity, at desc);

-- ── SHARED WRITER ───────────────────────────────────────────────────────────
-- Every trigger below funnels through this, so an entry can never be written
-- with a forged actor: it is always the caller, resolved server-side.
create or replace function write_audit(
  p_action     text,
  p_severity   text default 'operational',
  p_duty_id    text default null,
  p_admission  text default null,
  p_subject    text default null,
  p_related    text default null,
  p_field      text default null,
  p_old        text default null,
  p_new        text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log
    (actor_id, action, severity, duty_id, admission_no,
     subject_id, related_id, field, old_value, new_value)
  values
    (my_staff_id(), p_action, p_severity, p_duty_id, p_admission,
     p_subject, p_related, p_field, p_old, p_new);
$$;

-- ── ATTENDANCE OVERRIDES, ON THE NEW COLUMNS ────────────────────────────────
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

  if parent_state is distinct from 'submitted' then
    return new;
  end if;

  perform write_audit(
    'attendance_override', 'operational',
    new.duty_id, new.admission_no, parent_owner, null,
    'status', prev, new.status
  );
  return new;
end;
$$;

-- ── SAFETY ALERTS: THE RESOLUTION IS THE ONLY STATE ─────────────────────────
create table if not exists alert_resolutions (
  duty_id      text not null references duties(id),
  admission_no text not null references students(admission_no),
  -- Snapshot of which kind of alert was answered. Derived data can be
  -- recomputed; what someone was looking at when they signed it off cannot.
  kind         text not null,
  remark       text not null,
  resolved_by  text not null references staff(id),
  resolved_at  timestamptz not null default now(),
  primary key (duty_id, admission_no)
);

alter table alert_resolutions enable row level security;

drop policy if exists alert_res_select on alert_resolutions;
drop policy if exists alert_res_write  on alert_resolutions;

-- Readable by every staff member: a teacher must be able to see that the
-- child they reported absent has been accounted for, without asking.
create policy alert_res_select on alert_resolutions
  for select to authenticated
  using (my_staff_id() is not null);

-- Writable by oversight, or by the teacher who marked the checkpoint — they
-- are often the person who finds the child.
create policy alert_res_write on alert_resolutions
  for all to authenticated
  using (
    can_override()
    or exists (
      select 1 from duties d
      where d.id = duty_id
        and (d.staff_id = my_staff_id() or d.submitted_by = my_staff_id())
    )
  )
  with check (
    resolved_by = my_staff_id()
    and (
      can_override()
      or exists (
        select 1 from duties d
        where d.id = duty_id
          and (d.staff_id = my_staff_id() or d.submitted_by = my_staff_id())
      )
    )
  );

create or replace function log_alert_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  duty_owner text;
begin
  select submitted_by into duty_owner from duties where id = new.duty_id;

  perform write_audit(
    'alert_resolved', 'operational',
    new.duty_id, new.admission_no, duty_owner, null,
    'remark',
    case when tg_op = 'UPDATE' then old.remark else null end,
    new.remark
  );
  return new;
end;
$$;

drop trigger if exists alert_res_log on alert_resolutions;
create trigger alert_res_log
  after insert or update on alert_resolutions
  for each row execute function log_alert_resolution();

-- ── ROUTINE ADMINISTRATIVE TRAFFIC ──────────────────────────────────────────
-- One row per changed field rather than one per UPDATE: "who changed the
-- phone number" is the question, and a row saying "the staff row changed"
-- does not answer it.
create or replace function log_staff_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform write_audit('staff_added', 'routine', null, null, new.id);
    return new;
  end if;

  if new.phone is distinct from old.phone then
    perform write_audit('profile_updated', 'routine', null, null, new.id, null,
                        'phone', old.phone, new.phone);
  end if;
  if new.photo_url is distinct from old.photo_url then
    perform write_audit('profile_updated', 'routine', null, null, new.id, null,
                        'photo', old.photo_url, new.photo_url);
  end if;
  if new.name is distinct from old.name then
    perform write_audit('profile_updated', 'routine', null, null, new.id, null,
                        'name', old.name, new.name);
  end if;
  -- A role or class change is who-can-do-what, not routine housekeeping.
  if new.role is distinct from old.role then
    perform write_audit('role_changed', 'operational', null, null, new.id, null,
                        'role', old.role, new.role);
  end if;
  if new.class_key is distinct from old.class_key then
    perform write_audit('class_changed', 'operational', null, null, new.id, null,
                        'class', old.class_key, new.class_key);
  end if;
  return new;
end;
$$;

drop trigger if exists staff_log_changes on staff;
create trigger staff_log_changes
  after insert or update on staff
  for each row execute function log_staff_changes();

create or replace function log_student_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform write_audit('student_added', 'operational', null, new.admission_no);
  elsif new.active is distinct from old.active then
    perform write_audit('student_status_changed', 'operational', null, new.admission_no,
                        null, null, 'active', old.active::text, new.active::text);
  end if;
  return new;
end;
$$;

drop trigger if exists students_log_changes on students;
create trigger students_log_changes
  after insert or update on students
  for each row execute function log_student_changes();

-- Sign-in has no row of its own to hang a trigger on, so the app calls this.
-- It is still safe: the actor is resolved server-side from the caller's JWT,
-- so a client can only ever record its OWN sign-in, and cannot choose the
-- action or the severity.
create or replace function log_sign_in() returns void
language sql
security definer
set search_path = public
as $$ select write_audit('signed_in', 'routine') $$;

grant execute on function log_sign_in() to authenticated;

-- ── TIERED READING ──────────────────────────────────────────────────────────
drop policy if exists audit_log_select on audit_log;

create policy audit_log_select on audit_log
  for select to authenticated
  using (
    -- Administrators hold the full record, routine traffic included.
    my_role() = 'admin'
    -- Coordinators and the MOD get the operational record: everything that
    -- touches a child, none of the profile-and-sign-in noise.
    or (can_override() and severity = 'operational')
    -- Everyone else sees only what they did, and what was done to them.
    or actor_id   = my_staff_id()
    or subject_id = my_staff_id()
    or related_id = my_staff_id()
  );
