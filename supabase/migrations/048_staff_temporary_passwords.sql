-- 048 — A coordinator gives a new staff member a working login on the spot.
--
-- THE PROBLEM
-- `add_staff_member` (036) creates a staff ROW and nothing else. The person
-- then has to sign up with the same email and click a confirmation email that
-- Supabase's built-in sender delivers slowly, rate-limited, and often to spam.
-- In practice a teacher added in the morning could not sign in.
--
-- THE SHAPE (asked for by the school)
--   * Adding a staff member creates their Auth login immediately, with a
--     TEMPORARY password: the school default `Initial@123`, or a random one.
--   * The coordinator can see that temporary password, and copy the email +
--     password to hand over, until the person replaces it.
--   * On first sign-in the app makes them choose their own password
--     (`staff.must_change_password`). Once they do, the temporary password is
--     deleted — nobody, coordinator included, can ever read a password the
--     person chose. Supabase keeps only a bcrypt hash of that one.
--   * The same RPC resets a forgotten password, or creates a login for an
--     existing staff row that never signed up.
--
-- WHO MAY DO IT — same rules as `issue_password_reset` (036): coordinator or
-- admin; a coordinator only for teacher / nurse / reception; nobody for
-- themselves.
--
-- Re-runnable.

begin;

alter table staff add column if not exists must_change_password boolean not null default false;

-- Plain text ON PURPOSE, and only while the person has not yet chosen their
-- own: the coordinator has to be able to read it back to them. No policies —
-- read only through `list_staff_logins()`, which applies the role rule.
create table if not exists staff_temp_passwords (
  staff_id   text primary key references staff(id) on delete cascade,
  password   text not null,
  kind       text not null check (kind in ('default','random')),
  issued_by  text references staff(id),
  issued_at  timestamptz not null default now()
);
alter table staff_temp_passwords enable row level security;
revoke all on staff_temp_passwords from anon, authenticated;

-- "May this caller manage that staff member's login?"
create or replace function may_manage_login(p_staff text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_roster_desk()
     and exists (
       select 1 from staff t
        where t.id = p_staff
          and t.id is distinct from my_staff_id()
          and (my_role() = 'admin' or t.role not in ('coordinator','management','admin'))
     )
$$;
revoke all on function may_manage_login(text) from public, anon;

-- ── THE WORKER (not callable from the app) ──────────────────────────────────
-- Gives `p_staff` a login whose password is `p_password`, creating the Auth
-- user if there is none, and flags it for a change on first sign-in.
create or replace function _set_staff_login(p_staff text, p_password text, p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t   staff;
  v_uid uuid;
begin
  select * into v_t from staff where id = p_staff;
  if v_t.email is null or v_t.email = '' then
    raise exception '% has no email address to sign in with', v_t.name using errcode = '22023';
  end if;

  v_uid := v_t.auth_user_id;
  if v_uid is null then
    -- An account may already exist under this email (signed up, never
    -- linked, or never confirmed). Reuse it rather than make a second one.
    select id into v_uid from auth.users where lower(email) = lower(v_t.email);
  end if;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      lower(v_t.email), extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_t.name),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', lower(v_t.email),
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), null
    );
  else
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_uid;
    -- A reset signs them out everywhere: whoever had the old password is out.
    delete from auth.sessions where user_id = v_uid;
  end if;

  update staff set auth_user_id = v_uid, must_change_password = true where id = p_staff;

  insert into staff_temp_passwords (staff_id, password, kind, issued_by, issued_at)
  values (p_staff, p_password, p_kind, my_staff_id(), now())
  on conflict (staff_id) do update
    set password = excluded.password, kind = excluded.kind,
        issued_by = excluded.issued_by, issued_at = excluded.issued_at;
end $$;
revoke all on function _set_staff_login(text, text, text) from public, anon, authenticated;

create or replace function _temp_password(p_random boolean) returns text
language plpgsql volatile set search_path = public as $$
declare
  -- No 0/O, 1/l/I: these get read aloud and copied by hand.
  letters text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  digits  text := '23456789';
  b       bytea := extensions.gen_random_bytes(8);
  out     text := '';
begin
  if not coalesce(p_random, false) then
    return 'Initial@123';
  end if;
  for i in 0..4 loop
    out := out || substr(letters, (get_byte(b, i) % length(letters)) + 1, 1);
  end loop;
  out := out || '@';
  for i in 5..7 loop
    out := out || substr(digits, (get_byte(b, i) % length(digits)) + 1, 1);
  end loop;
  return out;   -- e.g. "Kmvqe@428" — 9 characters
end $$;
revoke all on function _temp_password(boolean) from public, anon, authenticated;

-- ── FOR THE APP ─────────────────────────────────────────────────────────────

-- Set (or reset) a temporary password. Returns it, so it can be shown.
create or replace function set_temporary_password(p_staff text, p_random boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t  staff;
  v_pw text := _temp_password(p_random);
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can set passwords' using errcode = '42501';
  end if;
  select * into v_t from staff where id = p_staff;
  if v_t.id is null or not v_t.active then
    raise exception 'That staff member is not active' using errcode = 'P0002';
  end if;
  if v_t.id = my_staff_id() then
    raise exception 'Use Change password on your own Account screen' using errcode = '42501';
  end if;
  if not may_manage_login(p_staff) then
    raise exception 'Only the administrator can set a % password', v_t.role using errcode = '42501';
  end if;

  perform _set_staff_login(p_staff, v_pw, case when p_random then 'random' else 'default' end);
  perform write_audit('temporary_password_set', 'operational', null, null, p_staff);
  return v_pw;
end $$;

-- Add a staff member AND give them a login, in one step.
create or replace function add_staff_member_with_login(
  p_name text, p_email text, p_phone text default null,
  p_role text default 'teacher', p_class_key text default null,
  p_random boolean default false
) returns table (staff_id text, temp_password text)
language plpgsql security definer set search_path = public as $$
declare
  v_staff staff;
  v_pw    text := _temp_password(p_random);
begin
  -- All the checks (role rules, email, duplicate, class) live in 036.
  v_staff := add_staff_member(p_name, p_email, p_phone, p_role, p_class_key);
  perform _set_staff_login(v_staff.id, v_pw, case when p_random then 'random' else 'default' end);
  return query select v_staff.id, v_pw;
end $$;

-- Every login this caller manages: the temporary password while it is still
-- the one in use, and whether the person has a login at all.
create or replace function list_staff_logins()
returns table (staff_id text, has_login boolean, must_change boolean,
               temp_password text, kind text, issued_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.auth_user_id is not null, s.must_change_password,
         p.password, p.kind, p.issued_at
    from staff s
    left join staff_temp_passwords p on p.staff_id = s.id
   where s.active and may_manage_login(s.id)
$$;

-- The person replaces their temporary password. Server-side so the flag and
-- the plain-text copy go in the same step as the new password.
create or replace function change_my_temporary_password(p_password text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me staff := my_staff();
  v_old text;
begin
  if v_me.id is null then
    raise exception 'Not signed in as staff' using errcode = '42501';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Choose a password of at least 8 characters' using errcode = '22023';
  end if;
  select password into v_old from staff_temp_passwords where staff_id = v_me.id;
  if p_password = v_old or p_password = 'Initial@123' then
    raise exception 'Choose a password that is different from the one you were given' using errcode = '22023';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = auth.uid();
  update staff set must_change_password = false where id = v_me.id;
  delete from staff_temp_passwords where staff_id = v_me.id;
  perform write_audit('temporary_password_replaced', 'routine', null, null, v_me.id);
end $$;

revoke all on function set_temporary_password(text, boolean) from public, anon;
revoke all on function add_staff_member_with_login(text, text, text, text, text, boolean) from public, anon;
revoke all on function list_staff_logins() from public, anon;
revoke all on function change_my_temporary_password(text) from public, anon;
grant execute on function set_temporary_password(text, boolean) to authenticated;
grant execute on function add_staff_member_with_login(text, text, text, text, text, boolean) to authenticated;
grant execute on function list_staff_logins() to authenticated;
grant execute on function change_my_temporary_password(text) to authenticated;

-- A password chosen through any other door (a reset code, or Account →
-- Change password) also ends the temporary one.
create or replace function clear_temp_password_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and not exists (
       select 1 from staff s join staff_temp_passwords p on p.staff_id = s.id
        where s.auth_user_id = new.id
          and extensions.crypt(p.password, new.encrypted_password) = new.encrypted_password
     ) then
    update staff set must_change_password = false where auth_user_id = new.id and must_change_password;
    delete from staff_temp_passwords
     where staff_id in (select id from staff where auth_user_id = new.id);
  end if;
  return new;
end $$;
drop trigger if exists clear_temp_password_on_change on auth.users;
create trigger clear_temp_password_on_change
  after update of encrypted_password on auth.users
  for each row execute function clear_temp_password_on_change();

commit;

notify pgrst, 'reload schema';

-- ── VERIFY — tests/staff-temp-passwords.test.cjs, against the mock project ──
--   coordinator adds a teacher with login -> signs in with Initial@123, must_change true
--   coordinator sees the temp password; a teacher calling list_staff_logins sees nothing
--   coordinator cannot set a password for another coordinator; teacher cannot set any
--   teacher changes it -> must_change false, temp gone, old password refused, new works
