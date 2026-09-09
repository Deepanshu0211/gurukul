-- 021 — An approved teacher can create their account.
--
-- THE BUG
-- `confirm_approved_signup` was a BEFORE INSERT trigger on `auth.users` that
-- did two things: confirmed the address, and pointed the staff row at the new
-- account. The second one cannot work in a BEFORE trigger:
--
--   update staff set auth_user_id = new.id ...
--
-- At BEFORE INSERT the row is not in `auth.users` yet. `staff.auth_user_id`
-- is a foreign key to it, so the constraint is checked against a table that
-- does not contain `new.id`, and the whole INSERT is rejected:
--
--   ERROR 23503: insert or update on table "staff" violates foreign key
--   constraint "staff_auth_user_id_fkey"
--   DETAIL: Key (auth_user_id)=(9fac4b43-…) is not present in table "users".
--
-- WHO IT BROKE
-- Anyone whose access request was APPROVED BEFORE THEY SIGNED UP — which is
-- the order migration 014 exists to support, and the one the school will
-- actually use: a coordinator works through the queue in the morning, the
-- teacher makes their account that evening. Their sign-up fails outright.
--
-- Signing up first and being approved afterwards was unaffected, because the
-- trigger's `exists (… state = 'approved')` guard was false at insert time.
-- That is why the three test accounts in this database work and why this went
-- unnoticed: the happy path in testing is the opposite of the one in use.
--
-- THE FIX
-- Split it. Confirming the address is a change to the row being inserted, so
-- it stays BEFORE. Linking the staff row is a change to a DIFFERENT table
-- that must see the new row, so it moves to AFTER.
--
-- NOTE ON WHERE THIS CAME FROM
-- `confirm_approved_signup` was created directly in the SQL editor and was
-- never in `supabase/migrations/`. A project rebuilt from this repository did
-- not have it at all, so the behaviour differed between environments with
-- nothing in version control to explain why. Both triggers are defined here
-- in full so the repository is now the whole truth.

-- ── BEFORE: confirm the address ─────────────────────────────────────────────
-- Only touches `new`, which is what a BEFORE trigger is for. An approved
-- request means a coordinator has already vouched for this person, so there
-- is nothing for a confirmation email to add.
create or replace function confirm_approved_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and exists (
    select 1 from staff_requests
     where lower(email) = lower(new.email) and state = 'approved'
  ) then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  end if;
  return new;
end;
$$;

-- ── AFTER: join the account to its staff row ────────────────────────────────
-- `after` so `new.id` is really in `auth.users` by the time the foreign key on
-- `staff.auth_user_id` is checked.
--
-- `auth_user_id is null` is kept from the original: it means a second account
-- claiming the same address cannot steal a staff row that is already linked.
-- The return value of an AFTER ROW trigger is ignored; `null` is conventional.
create or replace function link_approved_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and exists (
    select 1 from staff_requests
     where lower(email) = lower(new.email) and state = 'approved'
  ) then
    update staff
       set auth_user_id = new.id
     where lower(email) = lower(new.email)
       and auth_user_id is null;
  end if;
  return null;
end;
$$;

drop trigger if exists confirm_approved_signup on auth.users;
create trigger confirm_approved_signup
  before insert on auth.users
  for each row execute function confirm_approved_signup();

drop trigger if exists link_approved_signup on auth.users;
create trigger link_approved_signup
  after insert on auth.users
  for each row execute function link_approved_signup();

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- The test that fails on the old trigger and passes on this one — approve
-- first, sign up second:
--
--   begin;
--     insert into staff_requests (name, email, state)
--       values ('Trigger Test', 'trigger.test@gurukula.org', 'approved');
--     insert into staff (id, name, role, email)
--       values ('zz-test', 'Trigger Test', 'teacher', 'trigger.test@gurukula.org');
--     insert into auth.users (
--       instance_id, id, aud, role, email, encrypted_password,
--       created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
--     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
--       'authenticated', 'authenticated', 'trigger.test@gurukula.org',
--       extensions.crypt('x', extensions.gen_salt('bf')), now(), now(),
--       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
--     -- must return one row, linked, with email_confirmed_at set:
--     select s.id, s.auth_user_id is not null as linked, u.email_confirmed_at
--       from staff s join auth.users u on u.id = s.auth_user_id
--      where s.id = 'zz-test';
--   rollback;
--
-- On the old trigger the third insert raises 23503 and the transaction dies.
