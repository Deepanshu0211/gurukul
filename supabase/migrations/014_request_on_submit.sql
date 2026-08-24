-- 014 — The request reaches the coordinator when it is sent, not later.
--
-- WHY
-- 013 tied a request to `auth.uid()`, so it could only be filed by someone
-- holding a token. This project requires email confirmation, and Supabase
-- returns NO session from `signUp` until that link is clicked — so tapping
-- "Send request" filed nothing. The request was created on the requester's
-- FIRST SIGN-IN instead, which meant:
--
--   * the coordinator saw nothing until the teacher came back, and
--   * a teacher who never opened the confirmation email never appeared at all,
--     while the screen had already told them their request was on its way.
--
-- Now the request is written when the form is submitted, by anyone, and the
-- Auth account is joined to it whenever the email is actually confirmed.
--
-- WHAT THIS DOES NOT WEAKEN
-- A request is still not access. Approving it is still a coordinator's
-- deliberate act, the new row is still always `teacher`, and 012 still means
-- an unapproved account reads nothing. What changes is only WHEN the row
-- appears in the queue.
--
-- THE PART THAT NEEDED CARE
-- Linking an Auth account to a staff row by email is a privilege escalation
-- waiting to happen: if it were allowed on an unconfirmed address, anyone
-- could sign up as principal@… and claim that row. So `link_staff_account`
-- refuses unless `email_confirmed_at` is set — proof the person actually
-- holds the mailbox. That guard is the reason email confirmation must stay ON
-- for this project. Turning on `mailer_autoconfirm` would stamp
-- `email_confirmed_at` without anyone proving anything, and this function
-- would hand out staff rows on the strength of a typed address.

-- ── A REQUEST NO LONGER NEEDS A SESSION ─────────────────────────────────────
alter table staff_requests alter column auth_user_id drop not null;

-- 013's index only stopped one person opening two requests. The key is now the
-- email, because that is what identifies a requester before they have a token.
drop index if exists staff_requests_one_open;
create unique index if not exists staff_requests_one_open_email
  on staff_requests (lower(email)) where state = 'pending';

-- ── SUBMITTING ──────────────────────────────────────────────────────────────
-- Callable by `anon`. That is a public write endpoint, which is worth saying
-- out loud: anyone can put a row in this table. What they cannot do is give
-- themselves anything with it — the row is inert until a coordinator taps
-- Approve, and the unique index above caps it at one open request per address.
-- The cost of abuse is a coordinator deleting noise, not a breach.
--
-- It never reports whether an email already belongs to staff. Answering that
-- to an unauthenticated caller would turn this form into a way to test which
-- addresses work at the school, which is the sort of leak 012 just closed.
create or replace function submit_access_request(
  p_name  text,
  p_email text,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A name is required' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email is required' using errcode = '22023';
  end if;

  -- Already staff, or already asked: nothing to do, and nothing to say about
  -- which of the two it was.
  if exists (select 1 from staff where lower(email) = v_email) then
    return;
  end if;

  insert into staff_requests (auth_user_id, name, email, phone)
  values (
    -- Set when the form is submitted from a signed-in session; filled in later
    -- by `link_staff_account` otherwise.
    (select id from auth.users where lower(email) = v_email and email_confirmed_at is not null),
    trim(p_name), v_email, nullif(trim(p_phone), '')
  )
  on conflict do nothing;
end;
$$;

-- ── JOINING AN ACCOUNT TO ITS ROW ───────────────────────────────────────────
-- Called on every sign-in. Does nothing in the ordinary case; it matters for
-- the person who was approved before they confirmed their email, whose staff
-- row is sitting there with no `auth_user_id` and therefore no access.
--
-- `email_confirmed_at is not null` is the whole security of this function.
create or replace function link_staff_account()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    text;
begin
  select lower(email) into v_email
    from auth.users
   where id = auth.uid() and email_confirmed_at is not null;

  if v_email is null then
    return null;   -- not signed in, or the address was never confirmed
  end if;

  update staff
     set auth_user_id = auth.uid()
   where lower(email) = v_email
     and auth_user_id is null
  returning id into v_id;

  -- Same for a request filed before the account existed, so the queue shows
  -- the coordinator a request that is now backed by a real login.
  update staff_requests
     set auth_user_id = auth.uid()
   where lower(email) = v_email
     and auth_user_id is null;

  return v_id;
end;
$$;

-- ── APPROVING, WHEN THE ACCOUNT MAY NOT EXIST YET ───────────────────────────
create or replace function approve_staff_request(p_request uuid)
returns staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   staff_requests;
  v_id    text;
  v_uid   uuid;
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

  select * into v_req from staff_requests where id = p_request for update;

  if v_req.id is null then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if v_req.state <> 'pending' then
    raise exception 'That request was already decided' using errcode = '22023';
  end if;
  if exists (select 1 from staff where lower(email) = lower(v_req.email)) then
    raise exception 'A staff record already uses that email' using errcode = '23505';
  end if;

  -- Resolve the account now if there is one. A null here is not a failure: the
  -- teacher has been approved but has not confirmed their email yet, and
  -- `link_staff_account` will join the two the moment they do. Until then the
  -- row exists and grants nothing, because every policy keys off
  -- `my_staff_id()` and that resolves through `auth_user_id`.
  v_uid := coalesce(
    v_req.auth_user_id,
    (select id from auth.users
      where lower(email) = lower(v_req.email) and email_confirmed_at is not null)
  );

  loop
    v_id := 't' || nextval('staff_id_seq');
    exit when not exists (select 1 from staff where id = v_id);
  end loop;

  insert into staff (id, name, role, email, phone, active, auth_user_id)
  values (v_id, v_req.name, 'teacher', lower(v_req.email), v_req.phone, true, v_uid)
  returning * into v_staff;

  update staff_requests
     set state = 'approved', decided_by = my_staff_id(), decided_at = now(),
         auth_user_id = coalesce(auth_user_id, v_uid)
   where id = p_request;

  perform write_audit('access_approved', 'operational', null, null,
                      v_id, null, 'role', null, 'teacher');

  return v_staff;
end;
$$;

-- ── EXECUTE ─────────────────────────────────────────────────────────────────
revoke execute on function submit_access_request(text, text, text) from public;
revoke execute on function link_staff_account()                    from public;

-- `anon` deliberately: the form is reachable before anyone has a token.
grant execute on function submit_access_request(text, text, text) to anon, authenticated;
grant execute on function link_staff_account()                    to authenticated;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- With NO token at all (the anon key alone):
--   1. select submit_access_request('Test Teacher','test@example.com','900')
--        -> succeeds
--   2. select * from staff_requests            -> [] (anon still reads nothing)
--   3. repeat step 1                            -> succeeds, still ONE row
--   4. submit_access_request('X','krishna.saha@gurukula.org')
--        -> succeeds, inserts NOTHING, says nothing about why
--
-- With a coordinator token:
--   5. select * from staff_requests where state='pending'
--        -> the row from step 1, auth_user_id null
--   6. select approve_staff_request(<id>)      -> staff row, auth_user_id null
--
-- Then sign that address up, confirm the email, and sign in:
--   7. select link_staff_account()             -> the staff id
--   8. select * from students                  -> 415 rows
--
-- And the guard that matters:
--   9. As a DIFFERENT confirmed account, select link_staff_account()
--        -> null, and no staff row changes hands
