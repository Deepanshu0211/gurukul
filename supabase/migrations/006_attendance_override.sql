-- 006 — Overruling a teacher's submitted attendance.
--
-- WHY
-- 005 made a submitted record immutable to everyone except coordinators and
-- admins, and gave no way to see that a correction had happened. Two things
-- were missing in practice:
--
--   * Management (the MOD / Principal's office) could not correct anything.
--     They are the people a parent rings and the people an absence escalates
--     to, and they were the one oversight role locked out of fixing it.
--   * A correction overwrote the original silently. "He was marked absent at
--     Mangalarati" and "he was marked absent, then the coordinator changed it
--     to Sick an hour later" are different facts, and the second one was
--     unrecoverable.
--
-- WHAT CHANGES
--   * Coordinator, management and admin may amend a submitted record.
--   * Every such amendment writes a row to `audit_log`, by trigger — not by
--     the app, so it cannot be skipped, forged or deleted by a client.
--   * `duties.corrected_by` / `corrected_at` record that a checkpoint was
--     amended, WITHOUT disturbing `submitted_by`: the teacher who originally
--     marked it stays on the record as its author.
--
-- WHAT DOES NOT CHANGE
--   * Teachers still cannot touch a record once it is submitted.
--   * Reassigning a duty (`staff_id`) stays coordinator/admin, still enforced
--     by the trigger from 005. Being able to correct a mark is not the same
--     authority as being able to move a duty to a different teacher.
--   * Marking a checkpoint that is still pending is unaffected and unlogged —
--     that is ordinary work, not a correction.
--
-- TESTING (do not skip — see the header of 002):
--   1. Teacher token, update a submitted attendance row      -> must FAIL
--   2. Management token, same update                          -> must SUCCEED
--   3. After (2), select from audit_log                       -> one new row,
--      actor_id = the management staff id, old and new status both present
--   4. Teacher token, select from audit_log                   -> ZERO rows
--   5. Any token, insert directly into audit_log              -> must FAIL
--   6. Management token, update duties set staff_id = …       -> must FAIL

-- ── WHO MAY OVERRULE ────────────────────────────────────────────────────────
-- Named rather than inlined: three policies below test the same thing, and
-- they must never drift apart. Mirrors `canOverride` in src/domain/roles.js,
-- which decides only what the UI OFFERS — this is the enforcement.
create or replace function can_override() returns boolean
language sql stable security definer set search_path = public
as $$ select my_role() in ('coordinator','management','admin') $$;

-- ── THE RECORD OF A CORRECTION ──────────────────────────────────────────────
alter table duties add column if not exists corrected_by text references staff(id);
alter table duties add column if not exists corrected_at timestamptz;

-- One row per changed mark. `old_status`/`new_status` are plain text, not
-- references to status_types: retiring a status later must not rewrite or
-- break the history that used it.
create table if not exists audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     text references staff(id),
  action       text not null,
  duty_id      text references duties(id),
  admission_no text references students(admission_no),
  old_status   text,
  new_status   text
);

create index if not exists audit_log_duty_idx on audit_log (duty_id);
create index if not exists audit_log_at_idx   on audit_log (at desc);

alter table audit_log enable row level security;

-- ── THE LOG IS WRITTEN BY THE DATABASE, NOT THE APP ─────────────────────────
-- An app-side insert would be one forgotten call away from an unlogged
-- correction, and a client that can write the log can also write a false one.
create or replace function log_attendance_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev         text;
  parent_state text;
begin
  -- An UPDATE that lands on the same value is not a change worth recording.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  prev := case when tg_op = 'UPDATE' then old.status else null end;

  select state into parent_state from duties where id = new.duty_id;

  -- `submit_duty` writes every student's row while the duty is still pending
  -- and only then flips it to submitted, so the original submission never
  -- reaches this branch. Anything arriving after that is a correction.
  if parent_state is distinct from 'submitted' then
    return new;
  end if;

  insert into audit_log (actor_id, action, duty_id, admission_no, old_status, new_status)
  values (my_staff_id(), 'attendance_override', new.duty_id, new.admission_no, prev, new.status);

  return new;
end;
$$;

drop trigger if exists attendance_log_override on attendance;
create trigger attendance_log_override
  after insert or update on attendance
  for each row execute function log_attendance_override();

-- Readable by the roles that can cause an entry, so a correction can be
-- reviewed. There is deliberately NO insert, update or delete policy: rows
-- arrive only through the SECURITY DEFINER trigger above, which runs as the
-- table's owner and is therefore not subject to these policies. Nothing that
-- holds an `authenticated` token can forge or erase an entry.
drop policy if exists audit_log_select on audit_log;

create policy audit_log_select on audit_log
  for select to authenticated
  using (can_override());

-- ── WIDEN THE WRITE POLICIES TO MANAGEMENT ──────────────────────────────────
-- Same shape as 005, with can_override() in place of the inlined role list.
drop policy if exists attendance_insert on attendance;
drop policy if exists attendance_update on attendance;
drop policy if exists duties_update     on duties;

create policy attendance_insert on attendance
  for insert to authenticated
  with check (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.state = 'pending' or can_override())
  ));

create policy attendance_update on attendance
  for update to authenticated
  using (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.state = 'pending' or can_override())
  ))
  with check (exists (
    select 1 from duties d
    where d.id = duty_id
      and (d.state = 'pending' or can_override())
  ));

-- Needed so an overseer can stamp corrected_by/corrected_at on a duty that is
-- already submitted. The reassignment guard from 005 still runs on top of
-- this and keeps `staff_id` changes to coordinator/admin.
create policy duties_update on duties
  for update to authenticated
  using (state = 'pending' or can_override())
  with check (my_staff_id() is not null);
