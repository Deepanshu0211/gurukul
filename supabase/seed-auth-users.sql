-- seed-auth-users.sql
--
-- Gives every staff row in the register a working login, in one statement,
-- instead of 26 trips through Authentication → Users → Add user.
--
-- PASSWORD FOR EVERY ACCOUNT: Gurukula@123
--
-- These are throwaway development accounts sharing one password. Delete them
-- and issue real logins before the school uses this for anything, and do not
-- let this repository go public while they exist.
--
-- Run AFTER seed-mock-school.sql — it reads the staff table to decide which
-- accounts to make. Safe to re-run: existing addresses are skipped, so it will
-- not reset a password anybody has changed.
--
-- WHY THIS IS SAFE TO DO IN SQL
-- Supabase's own dashboard writes the same two rows. The password is hashed
-- with bcrypt by the database, never stored or transmitted in clear, and
-- email_confirmed_at is set because there is no inbox behind @gurukula.org to
-- click a confirmation link in.

create extension if not exists pgcrypto with schema extensions;

begin;

-- ── THE ACCOUNTS ────────────────────────────────────────────────────────────
-- The empty strings are NOT decoration. GoTrue reads these columns into Go
-- 'string' values rather than pointers, so a NULL in any of them makes every
-- sign-in for that account fail with a 500 and "Database error querying
-- schema" — the account exists, the password is right, and it is refused.
-- The dashboard's own Add User writes '' here for exactly this reason.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  s.email,
  extensions.crypt('Gurukula@123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', s.name),
  '', '', '', '', '', '', '', ''
from staff s
where s.email is not null
  and not exists (select 1 from auth.users u where lower(u.email) = lower(s.email));

-- ── THE EMAIL IDENTITY ──────────────────────────────────────────────────────
-- GoTrue matches a password sign-in against auth.identities, not auth.users.
-- An account with no identity row exists, shows up in the dashboard, and
-- rejects its own correct password — which is exactly what "incorrect email
-- or password" for every teacher looks like.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  created_at, updated_at, last_sign_in_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(), now(), now()
from auth.users u
where exists (select 1 from staff s where lower(s.email) = lower(u.email))
  and not exists (
    select 1 from auth.identities i
     where i.user_id = u.id and i.provider = 'email'
  );

-- ── REPAIR ANY ROW THAT PREDATES THE FIX ────────────────────────────────────
-- An account created by an earlier version of this file, or by hand, has NULL
-- in these columns and is refused at sign-in with a 500. Harmless to run
-- against accounts that are already correct.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where confirmation_token is null or recovery_token is null
   or email_change_token_new is null or email_change is null
   or email_change_token_current is null or phone_change is null
   or phone_change_token is null or reauthentication_token is null;

-- ── POINT THE STAFF ROWS AT THEM ────────────────────────────────────────────
update staff s
   set auth_user_id = u.id
  from auth.users u
 where lower(s.email) = lower(u.email)
   and s.auth_user_id is distinct from u.id;

commit;

-- ── CHECK ───────────────────────────────────────────────────────────────────
-- 'can sign in' must equal 'staff'. Anything less means a staff row whose
-- address has no Auth user, and that person's login will be refused.
select 'staff' as what, count(*)::text as n from staff
union all select 'auth users',  count(*)::text from auth.users
union all select 'identities',  count(*)::text from auth.identities where provider = 'email'
union all select 'can sign in', count(*)::text from staff where auth_user_id is not null
union all select 'unlinked',    count(*)::text from staff where auth_user_id is null;
