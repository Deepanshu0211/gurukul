-- 034 — The gate desk: a child leaves the campus with somebody's name on it,
--        and comes back the same way.
--
-- THE PROBLEM THIS SOLVES
-- Today a teacher marks a child "Home" from the marking screen, on her own
-- judgement, one checkpoint at a time. Three things follow from that, and all
-- three are bad:
--
--   1. It is a guess. She marks Home because the child is not in the line and
--      somebody mentioned a family visit. Nothing in the system knows whether
--      the child actually left the campus, when, or with whom.
--   2. It does not carry. The next checkpoint is a different teacher with a
--      fresh list, and the child defaults to Present — because Present is the
--      absence of a mark. A child who went home on Friday morning is recorded
--      present at Friday lunch, Friday night attendance and Saturday
--      Mangalarati, by nobody's decision.
--   3. Nothing brings them back. There is no moment at which the school knows
--      the child has returned, so there is no moment at which "Home" should
--      stop. It stops when a teacher stops typing it.
--
-- `status_types.spanning` has marked H/S/O/G as carrying statuses since the
-- first migration and nothing has ever read that column. This is the mechanism
-- it was waiting for.
--
-- THE SHAPE
-- Leaving campus is an event at the gate, not an observation in a classroom.
-- Reception signs the child OUT; from that moment every checkpoint records
-- them as Home (or Outing, or Gita Nagari) automatically and no teacher can
-- mark them Present. Reception signs them IN when they walk back through the
-- gate; from that moment the next checkpoint is theirs to mark normally again.
--
-- The teacher is not overruled — she is relieved of a decision she was never
-- in a position to make.

-- ── THE ROLE ────────────────────────────────────────────────────────────────
-- `reception` is front-desk staff. They hold the gate register and nothing
-- else: no duties, no marking, no roster edits, no alerts.
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check
  check (role in ('teacher','coordinator','management','admin','nurse','reception'));

-- 005 widened duty and attendance writes to "any staff member" for cover
-- marking, and said so in its own header: "Roles below staff (none today) must
-- never be granted `authenticated` without revisiting this file." This is that
-- revisit. Under 005 unamended, a reception login could open any pending
-- checkpoint in the school and submit a register for it.
--
-- `nurse` was already excluded by nothing but the app hiding the button —
-- `canMark()` in domain/roles.js returns false for them and the database
-- happily accepted the write. Both are closed here.
drop policy if exists duties_update on duties;
create policy duties_update on duties
  for update to authenticated
  using (
    my_staff_id() is not null
    and (state = 'pending' or my_role() in ('coordinator','admin'))
    and coalesce(my_role(), '') not in ('nurse','reception')
  )
  -- `my_staff_id() is not null` is carried over from 005 and is NOT optional.
  -- A signed-up account with no staff row has `my_role()` NULL, so
  -- `coalesce(my_role(), '') not in ('nurse','reception')` is TRUE for them —
  -- the role exclusion alone would have opened duty writes to exactly the
  -- accounts migration 012 was written to shut out.
  with check (
    my_staff_id() is not null
    and coalesce(my_role(), '') not in ('nurse','reception')
  );

drop policy if exists attendance_insert on attendance;
drop policy if exists attendance_update on attendance;

create policy attendance_insert on attendance
  for insert to authenticated
  with check (
    my_staff_id() is not null
    and coalesce(my_role(), '') not in ('nurse','reception')
    and exists (
      select 1 from duties d
      where d.id = duty_id
        and (d.state = 'pending' or my_role() in ('coordinator','admin'))
    )
  );

create policy attendance_update on attendance
  for update to authenticated
  using (
    my_staff_id() is not null
    and coalesce(my_role(), '') not in ('nurse','reception')
    and exists (
      select 1 from duties d
      where d.id = duty_id
        and (d.state = 'pending' or my_role() in ('coordinator','admin'))
    )
  )
  with check (
    my_staff_id() is not null
    and coalesce(my_role(), '') not in ('nurse','reception')
    and exists (
      select 1 from duties d
      where d.id = duty_id
        and (d.state = 'pending' or my_role() in ('coordinator','admin'))
    )
  );

-- ── THE GATE REGISTER ───────────────────────────────────────────────────────
-- One row per trip off campus. Open while `in_at` is null.
create table if not exists student_leave (
  id           bigserial primary key,
  admission_no text not null references students(admission_no),
  -- Which spanning status the child carries while they are away. Home is the
  -- ordinary case; Outing and Gita Nagari are the same mechanism with a
  -- different word on the register.
  status       text not null default 'H' references status_types(code),
  reason       text,

  -- The DAY, stored explicitly rather than derived from `out_at`. Every
  -- question asked of this table is "was this child away on the day this duty
  -- belongs to?", and `duties.day` is a date in the school's timezone.
  -- Deriving it from a timestamptz would put that Asia/Kolkata conversion in
  -- five different places and get it wrong at Mangalarati, which is the
  -- 4:30am checkpoint that migration 023 exists because of.
  out_day      date not null default school_today(),
  out_at       timestamptz not null default now(),
  out_by       text references staff(id),
  expected_back date,

  back_day     date,
  in_at        timestamptz,
  in_by        text references staff(id)
);

-- A child is either on campus or off it. This is the rule the whole feature
-- rests on, so it is a constraint and not a check in application code: without
-- it, two taps on a slow connection open two leaves, signing back in closes
-- one, and the child stays permanently Home with no way to see why.
create unique index if not exists student_leave_open_idx
  on student_leave (admission_no) where in_at is null;

create index if not exists student_leave_student_idx
  on student_leave (admission_no, out_day desc);

comment on table student_leave is
  'The gate register: a student signed out to family and signed back in. While '
  'a row is open (in_at is null) every checkpoint records that student with '
  '`status` and no teacher can mark them present.';

-- ── WHO IS AWAY ─────────────────────────────────────────────────────────────
-- `stable security definer` so the attendance trigger can consult it without
-- RLS filtering the answer. A coercion that depends on who is asking would
-- record a different register for a coordinator than for a teacher.
create or replace function open_leave(p_adm text)
returns student_leave
language sql
stable
security definer
set search_path = public
as $$
  select * from student_leave where admission_no = p_adm and in_at is null;
$$;

grant execute on function open_leave(text) to authenticated;

-- ── SIGNING OUT ─────────────────────────────────────────────────────────────
-- An RPC, not a table write, for the same reason as `staff_requests` in 013:
-- there is no INSERT or UPDATE policy on this table at all, so the client
-- cannot choose who signed a child out, when, or whether they are back. The
-- indirection IS the security model.
create or replace function sign_student_out(
  p_adm      text,
  p_status   text default 'H',
  p_reason   text default null,
  p_expected date default null
)
returns student_leave
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := my_staff_id();
  r    student_leave;
  name text;
begin
  -- `coalesce`, not `my_role() not in (…)`: a caller with no staff row makes
  -- `my_role()` NULL, `NULL not in (…)` is NULL, and `if NULL then` does
  -- nothing — the guard would wave them through. Same note as 013/015.
  if coalesce(my_role(), '') not in ('reception','coordinator','admin') then
    raise exception 'Only reception, a coordinator or an administrator can sign a student out.'
      using errcode = '42501';
  end if;

  select students.name into name from students
   where admission_no = p_adm and active;
  if name is null then
    raise exception 'No active student with admission number %.', p_adm
      using errcode = 'P0002';
  end if;

  -- Only a spanning status means "away from school until further notice".
  -- Activity and Self study are things that happen ON campus and end when the
  -- checkpoint does; signing a child out under one of those would leave them
  -- carrying it forever.
  if not exists (select 1 from status_types where code = p_status and spanning) then
    raise exception '% is not a status a student can be signed out under.', p_status
      using errcode = '22023';
  end if;

  -- Caught by the partial unique index too; raised here so the message is a
  -- sentence rather than a constraint name.
  if exists (select 1 from student_leave where admission_no = p_adm and in_at is null) then
    raise exception '% is already signed out. Sign them back in first.', name
      using errcode = '23505';
  end if;

  insert into student_leave (admission_no, status, reason, out_by, expected_back)
  values (p_adm, p_status, nullif(trim(coalesce(p_reason, '')), ''), me, p_expected)
  returning * into r;

  return r;
end;
$$;

-- ── SIGNING BACK IN ─────────────────────────────────────────────────────────
-- This is the moment the teacher gets the child back. Nothing else in the
-- system ends a leave — not time, not the expected return date, not a
-- teacher's judgement at a checkpoint. `expected_back` is a note for the desk,
-- never a trigger: a child who was expected on Sunday and did not arrive must
-- keep reading as away, because that is the truth and because the alternative
-- silently returns a child the school has not seen.
create or replace function sign_student_in(p_adm text)
returns student_leave
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := my_staff_id();
  r    student_leave;
  name text;
begin
  if coalesce(my_role(), '') not in ('reception','coordinator','admin') then
    raise exception 'Only reception, a coordinator or an administrator can sign a student back in.'
      using errcode = '42501';
  end if;

  select students.name into name from students where admission_no = p_adm;

  update student_leave
     set in_at    = now(),
         back_day = school_today(),
         in_by    = me
   where admission_no = p_adm and in_at is null
   returning * into r;

  if r.id is null then
    raise exception '% is not signed out.', coalesce(name, p_adm)
      using errcode = 'P0002';
  end if;

  return r;
end;
$$;

revoke all on function sign_student_out(text, text, text, date) from public;
revoke all on function sign_student_in(text) from public;
grant execute on function sign_student_out(text, text, text, date) to authenticated;
grant execute on function sign_student_in(text) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table student_leave enable row level security;

drop policy if exists student_leave_read on student_leave;

-- Readable by any staff member — a teacher opening a checkpoint needs to know
-- why a child's row is locked, and "Home since Friday, signed out by
-- reception" is the answer. Same test as 012 uses on `students`: a staff row,
-- not merely an authenticated token.
create policy student_leave_read on student_leave
  for select to authenticated
  using (my_staff_id() is not null);

-- No INSERT, UPDATE or DELETE policy exists, deliberately. Every write goes
-- through the two functions above.

-- ── THE CARRY ───────────────────────────────────────────────────────────────
-- What makes a signed-out child stay signed out across every checkpoint, and
-- what stops a teacher marking them present.
--
-- COERCION, NOT REFUSAL, and this is the important choice. Raising an
-- exception would fail the whole submission — one child away from home would
-- stop a teacher filing a register of forty, at 4:30 in the morning, with a
-- Postgres error on her phone. Coercing writes the correct mark for that one
-- child and lets the other thirty-nine through.
--
-- The app does not rely on this. `DutyMarkingScreen` pre-fills the status and
-- locks the row, so the teacher sees the truth rather than being quietly
-- corrected. This is the backstop for the phone that has been open since
-- before the child left.
--
-- SCOPED TO DAYS THE LEAVE ACTUALLY COVERS. `dd.day >= l.out_day`, so
-- correcting last Tuesday's register while a child is away this week is
-- untouched. A leave reaches forward, never back.
create or replace function carry_open_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  carried text;
begin
  select l.status into carried
    from student_leave l
    join duties dd on dd.id = new.duty_id
   where l.admission_no = new.admission_no
     and l.in_at is null
     and dd.day >= l.out_day;

  if carried is not null then
    new.status := carried;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_carry_leave on attendance;
create trigger attendance_carry_leave
  before insert or update on attendance
  for each row execute function carry_open_leave();

comment on function carry_open_leave() is
  'A student with an open gate-register row is recorded with that row''s '
  'status at every checkpoint from the day they left, whatever the app sends. '
  'Ends the moment reception signs them back in.';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- Give a test account role 'reception' first:
--   update staff set role = 'reception' where id = '<someone>';
--
-- With the RECEPTION token:
--   select * from sign_student_out('S2401021', 'H', 'Family visit', current_date + 3);
--   -> one row, out_by = their staff id, in_at null
--   select * from sign_student_out('S2401021');
--   -> ERROR: Aarav Sharma is already signed out. Sign them back in first.
--   select * from submit_duty('<any pending duty>', '[]'::jsonb);
--   -> ERROR / 0 rows written — reception cannot mark a register
--
-- With a TEACHER token, on a duty whose group includes S2401021, marking that
-- child PRESENT (that is: omitting them from p_marks, or sending null):
--   select * from submit_duty('<their duty>', '[{"admission_no":"S2401021","status":null}]');
--   select status from attendance
--    where duty_id = '<their duty>' and admission_no = 'S2401021';
--   -> 'H'.  NOT null. This is the whole feature in one query.
--
-- Back at the desk:
--   select * from sign_student_in('S2401021');   -> in_at set, back_day today
-- Then, as the teacher, on the NEXT checkpoint, marking them present:
--   -> status null. They are back and markable again.
--
-- And the boundary that must not move:
--   select * from sign_student_out('S2401021', 'V');
--   -> ERROR: V is not a status a student can be signed out under.
--
-- With a TEACHER token:
--   select * from sign_student_out('S2401020');
--   -> ERROR: Only reception, a coordinator or an administrator can …
