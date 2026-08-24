-- 013 — Asking to become staff, and a coordinator deciding.
--
-- WHY
-- Until now every login was created by hand: an admin adds an Auth user in the
-- dashboard, then a matching `staff` row, and the two are paired by email in
-- seed.sql. That does not scale past the pilot, and it means a new teacher
-- cannot start on their first morning without catching the one person who has
-- dashboard access.
--
-- WHAT THIS IS
-- A request queue. Signing up gets you an Auth account and nothing else — 012
-- made sure an account with no `staff` row reads nothing at all. You then ask
-- for access, and a coordinator turns that request into a staff row, or does
-- not. The staff row IS the access; until it exists there is nothing to
-- escalate from.
--
-- EVERY WRITE IS A FUNCTION, NOT A POLICY
-- There is deliberately no INSERT or UPDATE policy on this table. A policy can
-- say "you may insert a row where auth_user_id = auth.uid()", but it cannot
-- stop that same row carrying `state = 'approved'`, and an approved request is
-- the thing a coordinator's tap converts into a login. So the client never
-- writes here directly: it calls a function that decides every column that
-- matters — who you are, from the token, and what state the row is in.
--
-- ROLE IS HARDCODED TO 'teacher'
-- `approve_staff_request` takes no role argument. A coordinator approving a
-- request cannot mint a coordinator, an admin, or a nurse, whatever the client
-- sends, because there is no parameter to send it in. Promoting someone stays
-- an admin action under 002's `staff_write_admin`. This is the difference
-- between "the coordinator approves teachers" and "the coordinator is an
-- admin", and it is worth a whole sentence because the UI cannot enforce it.

-- ── THE QUEUE ───────────────────────────────────────────────────────────────
create table if not exists staff_requests (
  id            uuid primary key default gen_random_uuid(),
  -- The identity that matters. `email` below is for reading in a list; this
  -- is what an approval actually links a staff row to.
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  phone         text,
  -- "Ajay asked me to join the Class 9 rota" — free text, so a coordinator who
  -- does not recognise the name has something to go on.
  note          text,
  state         text not null default 'pending'
                check (state in ('pending','approved','rejected')),
  requested_at  timestamptz not null default now(),
  decided_by    text references staff(id),
  decided_at    timestamptz,
  decision_note text
);

-- One OPEN request per person, not one ever. A rejection that meant "you put
-- the wrong phone number in" must not lock someone out permanently, and a
-- rejected requester still has no access at all, so re-applying costs nothing
-- but a coordinator's second glance.
create unique index if not exists staff_requests_one_open
  on staff_requests (auth_user_id) where state = 'pending';

create index if not exists staff_requests_state_idx
  on staff_requests (state, requested_at desc);

alter table staff_requests enable row level security;

-- ── READING ─────────────────────────────────────────────────────────────────
drop policy if exists staff_requests_read_own on staff_requests;
drop policy if exists staff_requests_read_desk on staff_requests;

-- Your own, so the app can tell you where your request got to. This is the one
-- table in the schema a person with no staff row can read anything from.
create policy staff_requests_read_own on staff_requests
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy staff_requests_read_desk on staff_requests
  for select to authenticated
  using (my_role() in ('coordinator','admin'));

-- No insert, update or delete policy. See the header.

-- ── ASKING ──────────────────────────────────────────────────────────────────
-- `email` is read from auth.users rather than taken from the caller, so the
-- name on the request cannot be one address while the account is another.
create or replace function request_staff_access(
  p_name  text,
  p_phone text default null,
  p_note  text default null
)
returns staff_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row   staff_requests;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if my_staff_id() is not null then
    raise exception 'This account already has access' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'A name is required' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into staff_requests (auth_user_id, name, email, phone, note)
  values (auth.uid(), trim(p_name), v_email, nullif(trim(p_phone), ''),
          nullif(trim(p_note), ''))
  returning * into v_row;

  return v_row;
exception
  -- The partial unique index above. A duplicate here is someone tapping twice
  -- on a slow connection, not an error worth a red screen.
  when unique_violation then
    select * into v_row from staff_requests
     where auth_user_id = auth.uid() and state = 'pending';
    return v_row;
end;
$$;

-- ── APPROVING ───────────────────────────────────────────────────────────────
-- Ids so far are hand-assigned ('t1', 'c1'). New ones come off a sequence that
-- starts well clear of those, and the loop covers the case where somebody adds
-- 't100' by hand later.
create sequence if not exists staff_id_seq start 100;

create or replace function approve_staff_request(p_request uuid)
returns staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   staff_requests;
  v_id    text;
  v_staff staff;
begin
  -- `coalesce`, and not `my_role() not in (…)`, because a caller with no staff
  -- row makes `my_role()` NULL, `NULL not in (…)` is NULL, and `if NULL then`
  -- does not fire — the guard would wave through exactly the person it exists
  -- to stop. A pending teacher can read their own request id, so that reads
  -- "approve yourself".
  if coalesce(my_role(), '') not in ('coordinator','admin') then
    raise exception 'Only a coordinator can approve access' using errcode = '42501';
  end if;

  -- `for update` so two coordinators tapping Approve at the same moment
  -- serialise into one staff row rather than two.
  select * into v_req from staff_requests where id = p_request for update;

  if v_req.id is null then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if v_req.state <> 'pending' then
    raise exception 'That request was already decided' using errcode = '22023';
  end if;

  -- Someone may have been added by hand between the request and the approval.
  if exists (select 1 from staff where auth_user_id = v_req.auth_user_id) then
    raise exception 'That person already has a staff record' using errcode = '23505';
  end if;
  if exists (select 1 from staff where lower(email) = lower(v_req.email)) then
    raise exception 'A staff record already uses that email' using errcode = '23505';
  end if;

  loop
    v_id := 't' || nextval('staff_id_seq');
    exit when not exists (select 1 from staff where id = v_id);
  end loop;

  -- role is 'teacher', always. There is no parameter for it on purpose.
  insert into staff (id, name, role, email, phone, active, auth_user_id)
  values (v_id, v_req.name, 'teacher', v_req.email, v_req.phone, true,
          v_req.auth_user_id)
  returning * into v_staff;

  update staff_requests
     set state = 'approved', decided_by = my_staff_id(), decided_at = now()
   where id = p_request;

  perform write_audit('access_approved', 'operational', null, null,
                      v_id, null, 'role', null, 'teacher');

  return v_staff;
end;
$$;

-- ── REJECTING ───────────────────────────────────────────────────────────────
create or replace function reject_staff_request(p_request uuid, p_note text default null)
returns staff_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row staff_requests;
begin
  -- `coalesce`, and not `my_role() not in (…)`, because a caller with no staff
  -- row makes `my_role()` NULL, `NULL not in (…)` is NULL, and `if NULL then`
  -- does not fire — the guard would wave through exactly the person it exists
  -- to stop. A pending teacher can read their own request id, so that reads
  -- "approve yourself".
  if coalesce(my_role(), '') not in ('coordinator','admin') then
    raise exception 'Only a coordinator can decide access' using errcode = '42501';
  end if;

  update staff_requests
     set state = 'rejected', decided_by = my_staff_id(), decided_at = now(),
         decision_note = nullif(trim(p_note), '')
   where id = p_request and state = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'That request was already decided' using errcode = '22023';
  end if;

  perform write_audit('access_rejected', 'operational', null, null,
                      null, null, 'request', v_row.email, 'rejected');

  return v_row;
end;
$$;

-- ── EXECUTE ─────────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, which would let an anonymous
-- caller reach these. Every one of them checks auth.uid() or my_role() first,
-- so that is not a hole — but revoking says so out loud rather than relying on
-- a reader noticing the guard.
revoke execute on function request_staff_access(text, text, text) from public;
revoke execute on function approve_staff_request(uuid)            from public;
revoke execute on function reject_staff_request(uuid, text)       from public;

grant execute on function request_staff_access(text, text, text) to authenticated;
grant execute on function approve_staff_request(uuid)            to authenticated;
grant execute on function reject_staff_request(uuid, text)       to authenticated;

-- ── VERIFY BY HAND, BOTH DIRECTIONS ─────────────────────────────────────────
-- With a freshly signed-up token that has NO staff row:
--   1. select request_staff_access('Test Teacher', '9000000000', 'hello')
--        -> a row, state 'pending'
--   2. select * from students                       -> [] (012 still holds)
--   3. select * from staff_requests                 -> only their own row
--   4. update staff_requests set state='approved'   -> 0 rows / rejected
--   5. select approve_staff_request(<own id>)       -> fails, 42501
--
-- With a teacher token:
--   6. select approve_staff_request(<that id>)      -> fails, 42501
--
-- With a coordinator token:
--   7. select * from staff_requests                 -> the pending row
--   8. select approve_staff_request(<that id>)      -> a staff row, role
--                                                      'teacher', id 't100'
--   9. select approve_staff_request(<same id>)      -> fails, already decided
--
-- Then, as the requester, sign out and back in: the app should now open on
-- Duties. Delete the test staff row, the request and the Auth user afterwards.
