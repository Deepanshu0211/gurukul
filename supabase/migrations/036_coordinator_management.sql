-- 036 — The coordinator runs the roster from the app.
--
-- WHAT THIS ADDS
--   1. Checkpoints a coordinator can add, retime, switch off and remove.
--   2. `duty_defaults` — the recurring roster the SRS (B2) and the self-build
--      guide always described and nothing ever created. One row is "this
--      group, at this checkpoint, on these weekdays, marked by this person".
--      A group is a class, a band, a house, residential-only or the whole
--      school — or a hand-picked list of students (the Remedial class).
--   3. Per-group student lists: `members` (only these children) and
--      `excluded` (everyone in the group except these). Honoured by
--      `attendance_group_contains` here and by `resolveGroup` in the app.
--   4. Adding a staff member and deactivating one (never deleting).
--   5. A coordinator-issued, one-time password reset code.
--
-- HOW THE GENERATOR CHANGES
-- The live `generate_duties` differs between databases (the Vedic pilot
-- scripts rewrote it in place), so this migration does NOT replace its body.
-- It renames whatever is there to `generate_builtin_duties` and puts a thin
-- `generate_duties` in front that runs it, then layers the defaults on top.
-- The cron job, the holiday trigger and `generate_duties_ahead` all call
-- `generate_duties` by name and pick up the new behaviour with no change.
--
-- SAFE TO APPLY TO THE PILOT
-- The new SRS checkpoints are created with NO default groups, so applying this
-- generates no new duty for anyone until a coordinator adds a group in the app.
-- Mock groups for them live in `supabase/seed-checkpoints-mock.sql`.
--
-- Every write here is an RPC. `duty_defaults` and `password_resets` have no
-- INSERT/UPDATE/DELETE policy at all, so the role checks inside the functions
-- are the only door — the same model 013 uses for access requests.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ── 0. A DEACTIVATED ACCOUNT IS NOBODY ──────────────────────────────────────
-- Every policy keys off these helpers. Until now they ignored `active`, so a
-- staff member marked inactive kept every permission they had. Filtering here
-- closes all of them at once: an inactive login reads like an account with no
-- staff row, which migration 012 already shuts out of the register.
create or replace function my_staff() returns staff
language sql stable security definer set search_path = public as
$$ select * from staff where auth_user_id = auth.uid() and active $$;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from staff where auth_user_id = auth.uid() and active $$;

create or replace function my_staff_id() returns text
language sql stable security definer set search_path = public as
$$ select id from staff where auth_user_id = auth.uid() and active $$;

create or replace function my_class_key() returns text
language sql stable security definer set search_path = public as
$$ select class_key from staff where auth_user_id = auth.uid() and active $$;

-- One spelling of "may run the roster", so the functions below cannot drift.
create or replace function is_roster_desk() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role(), '') in ('coordinator', 'admin') $$;

revoke all on function is_roster_desk() from public, anon;
grant execute on function is_roster_desk() to authenticated;

-- ── 1. CHECKPOINTS ──────────────────────────────────────────────────────────
alter table checkpoints add column if not exists active boolean not null default true;
alter table checkpoints add column if not exists mandatory_escalation boolean not null default false;

-- SRS C2: prasadam and night are the mandatory-escalation checkpoints.
update checkpoints set mandatory_escalation = true
 where id in ('breakfast', 'night') and not mandatory_escalation;

-- The SRS checkpoints this database did not have yet (attendance-requirements
-- §6). Times are the "indicative windows" from that table; a coordinator can
-- retime them in the app. Morning self study has no fixed time ("as
-- scheduled"), so it is left for the school to add with its real window.
insert into checkpoints (id, name, start_min, end_min, mandatory_escalation) values
  ('sports',        'Evening sports',     990,  1030, false),
  ('remedial',      'Remedial class',     1035, 1065, false),
  ('evening-study', 'Evening self study', 1110, 1140, false),
  ('dinner',        'Dinner prasadam',    1155, 1195, true)
on conflict (id) do nothing;

-- ── 2. CUSTOM MEMBERSHIP ON A DUTY ──────────────────────────────────────────
alter table duties add column if not exists members    text[];
alter table duties add column if not exists excluded   text[];
alter table duties add column if not exists default_id text;

create index if not exists duties_default_day_idx on duties (default_id, day) where default_id is not null;

-- 035's membership rule plus the two lists. `members` replaces the class /
-- band / house cut entirely (a hand-picked list IS the group); `excluded`
-- narrows whatever the group otherwise is. Residential-only still applies to
-- a hand-picked list: a day scholar picked for an evening group is at home.
create or replace function public.attendance_group_contains(d public.duties, s public.students)
returns boolean language sql stable set search_path = public as $$
 select s.active
 and (d.scope is distinct from 'res' or s.stype <> 'Day Scholar')
 and (d.excluded is null or not (s.admission_no = any (d.excluded)))
 and case
  when d.members is not null then s.admission_no = any (d.members)
  else
   (not d.exclude_vedic or upper(trim(s.section)) <> 'VEDIC')
   and case
    when d.class_key = '*|VEDIC' then upper(trim(s.section)) = 'VEDIC'
    when d.class_key ~ '^[0-9]+\|\*$' then s.grade = split_part(d.class_key, '|', 1)::int
    when d.class_key is not null then s.grade || '|' || s.section = d.class_key
    else (d.band is null or (d.band = 'Primary' and s.grade between 2 and 5)
     or (d.band = 'Middle' and s.grade between 6 and 8) or (d.band = 'Senior' and s.grade between 9 and 12))
     and (d.house is null or s.house = d.house)
   end
 end
$$;
revoke all on function public.attendance_group_contains(public.duties, public.students) from public, anon;
grant execute on function public.attendance_group_contains(public.duties, public.students) to authenticated, service_role;

-- ── 3. THE RECURRING ROSTER ─────────────────────────────────────────────────
create table if not exists duty_defaults (
  id            text primary key default ('dd' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  checkpoint_id text not null references checkpoints(id),
  group_label   text not null check (length(trim(group_label)) between 1 and 60),
  class_key     text,
  scope         text check (scope in ('res', 'all')),
  band          text check (band in ('Primary', 'Middle', 'Senior')),
  house         text references houses(name),
  members       text[],
  excluded      text[],
  -- Null = nobody chosen yet; the duty falls to a coordinator rather than the
  -- generator failing on `duties.staff_id not null`.
  staff_id      text references staff(id),
  -- 0 = Sunday … 6 = Saturday, as `extract(dow)` counts.
  days          int[] not null default '{0,1,2,3,4,5,6}',
  active        boolean not null default true,
  created_by    text references staff(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table duty_defaults enable row level security;
drop policy if exists duty_defaults_read on duty_defaults;
create policy duty_defaults_read on duty_defaults for select using (my_staff_id() is not null);
-- No write policy. See the header.

-- ── 4. THE GENERATOR ────────────────────────────────────────────────────────
-- Rename once. Re-running this migration finds the builtin already there and
-- leaves it alone, so the wrapper below never ends up calling itself.
do $$
begin
  if to_regprocedure('public.generate_builtin_duties(date)') is null then
    alter function public.generate_duties(date) rename to generate_builtin_duties;
  end if;
end $$;

revoke all on function generate_builtin_duties(date) from public, anon, authenticated;

-- Whether the day runs classes / the hostel. 033's helpers when that migration
-- is applied, an ordinary day when it is not (the mock database lacks it).
create or replace function day_runs(p_day date, p_kind text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := true;
begin
  if p_kind = 'classes' and to_regprocedure('public.classes_run_on(date)') is not null then
    execute 'select public.classes_run_on($1)' into ok using p_day;
  elsif p_kind = 'hostel' and to_regprocedure('public.hostel_runs_on(date)') is not null then
    execute 'select public.hostel_runs_on($1)' into ok using p_day;
  end if;
  return coalesce(ok, true);
end $$;
revoke all on function day_runs(date, text) from public, anon;

create or replace function apply_duty_defaults(p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare
  d          date := p_day;
  stamp      text := to_char(p_day, 'YYYYMMDD');
  dow        int  := extract(dow from p_day)::int;
  classes    boolean := day_runs(p_day, 'classes');
  hostel     boolean := day_runs(p_day, 'hostel');
  -- A day whose Vedic students have their own register (035 / vedic pilot).
  -- New band and whole-school groups must leave them out, or every Vedic child
  -- is counted twice at that checkpoint.
  partitioned boolean := exists (select 1 from duties where day = p_day and class_key = '*|VEDIC');
  fallback   text := (select id from staff where active and role = 'coordinator' order by id limit 1);
  n          int;
begin
  -- Withdraw what no longer applies: a group switched off, moved off this
  -- weekday, or whose checkpoint was switched off. Pending and unmarked only —
  -- nothing in this file ever deletes a register somebody has filled in.
  delete from duties x
   where x.day = d and x.default_id is not null and x.state = 'pending'
     and not exists (select 1 from attendance a where a.duty_id = x.id)
     and not exists (
       select 1 from duty_defaults dd join checkpoints c on c.id = dd.checkpoint_id
        where dd.id = x.default_id and dd.active and c.active and dow = any (dd.days)
          and case when dd.class_key is not null then classes else hostel end);

  insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house,
                      staff_id, exclude_vedic, members, excluded, default_id)
  select 'dd-' || dd.id || '-' || stamp, dd.checkpoint_id, d, dd.group_label, dd.class_key,
         dd.scope, dd.band, dd.house,
         coalesce((select s.id from staff s where s.id = dd.staff_id and s.active), fallback, 'c1'),
         partitioned and dd.class_key is null and dd.members is null,
         dd.members, dd.excluded, dd.id
    from duty_defaults dd join checkpoints c on c.id = dd.checkpoint_id
   where dd.active and c.active and dow = any (dd.days)
     and case when dd.class_key is not null then classes else hostel end
  on conflict (id) do update
    set group_label = excluded.group_label, class_key = excluded.class_key,
        scope = excluded.scope, band = excluded.band, house = excluded.house,
        members = excluded.members, excluded = excluded.excluded,
        -- Never staff_id: a one-day reassignment (the Roster's Reassign) must
        -- survive tonight's run. A change to the group's own marker is pushed
        -- by save_duty_default instead.
        staff_id = coalesce(duties.staff_id, excluded.staff_id)
    -- A filled-in register keeps the group it was taken against.
    where duties.state = 'pending'
      and not exists (select 1 from attendance a where a.duty_id = duties.id);

  -- Same rule as the builtin generator: one Vedic register per checkpoint on a
  -- partitioned day, for checkpoints that only exist because of a default.
  if partitioned then
    insert into duties (id, checkpoint_id, day, group_label, class_key, scope, staff_id)
    select 'vedic-' || x.checkpoint_id || '-' || stamp, x.checkpoint_id, d, 'Vedic', '*|VEDIC',
           case when bool_and(coalesce(x.scope = 'res', false)) then 'res' else 'all' end,
           coalesce(fallback, 'c1')
      from duties x
     where x.day = d and x.default_id is not null and x.exclude_vedic
       and not exists (select 1 from duties v where v.day = d and v.checkpoint_id = x.checkpoint_id and v.class_key = '*|VEDIC')
     group by x.checkpoint_id
    on conflict (id) do nothing;

    -- ...and the reverse. The builtin generator adds a Vedic register to EVERY
    -- checkpoint that has any duty, which is right for its own whole-school
    -- and band registers but wrong for a checkpoint made only of class-wise
    -- or hand-picked groups: a Remedial batch of twelve would come with a
    -- second register holding every Vedic child in the school. A Vedic
    -- register is only needed where some register on that checkpoint leaves
    -- the Vedic students out.
    delete from duties v
     where v.day = d and v.class_key = '*|VEDIC' and v.state = 'pending'
       and not exists (select 1 from attendance a where a.duty_id = v.id)
       and not exists (select 1 from duties x where x.day = d and x.checkpoint_id = v.checkpoint_id
                         and x.id <> v.id and x.exclude_vedic);
  end if;

  -- A checkpoint a coordinator switched off takes the builtin registers with it.
  delete from duties x
   using checkpoints c
   where c.id = x.checkpoint_id and not c.active
     and x.day = d and x.state = 'pending'
     and not exists (select 1 from attendance a where a.duty_id = x.id);

  select count(*) into n from duties where day = d;
  return n;
end $$;
revoke all on function apply_duty_defaults(date) from public, anon, authenticated;

create or replace function generate_duties(p_day date default null) returns int
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_day, school_today());
begin
  perform generate_builtin_duties(d);
  return apply_duty_defaults(d);
end $$;
revoke all on function generate_duties(date) from public, anon;
grant execute on function generate_duties(date) to authenticated;

-- Today and tomorrow, after any roster change, so the change is on phones now
-- rather than after the 00:30 job.
create or replace function refresh_upcoming_duties() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform apply_duty_defaults(school_today());
  perform apply_duty_defaults(school_today() + 1);
end $$;
revoke all on function refresh_upcoming_duties() from public, anon, authenticated;

-- ── 5. CHECKPOINT RPCs ──────────────────────────────────────────────────────
-- Audit rows: `subject_id` and `related_id` reference staff, so a checkpoint
-- or group id travels in `field` and its name in `new_value`.
create or replace function save_checkpoint(
  p_id text, p_name text, p_start int, p_end int, p_mandatory boolean default false
) returns checkpoints
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id   text := nullif(trim(coalesce(p_id, '')), '');
  v_row  checkpoints;
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can change checkpoints' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 40 then
    raise exception 'Give the checkpoint a name of 2 to 40 characters' using errcode = '22023';
  end if;
  if p_start is null or p_end is null or p_start < 0 or p_end > 1440 or p_end <= p_start then
    raise exception 'The window must end after it starts, within one day' using errcode = '22023';
  end if;
  if exists (select 1 from checkpoints where lower(name) = lower(v_name) and id is distinct from v_id) then
    raise exception 'A checkpoint called % already exists', v_name using errcode = '23505';
  end if;

  if v_id is null then
    v_id := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_id = '' or exists (select 1 from checkpoints where id = v_id) then
      v_id := v_id || '-' || substr(md5(random()::text), 1, 4);
    end if;
    insert into checkpoints (id, name, start_min, end_min, mandatory_escalation)
    values (v_id, v_name, p_start, p_end, coalesce(p_mandatory, false))
    returning * into v_row;
    perform write_audit('checkpoint_added', 'operational', null, null, null, null, v_id, null, v_name);
  else
    update checkpoints
       set name = v_name, start_min = p_start, end_min = p_end,
           mandatory_escalation = coalesce(p_mandatory, mandatory_escalation)
     where id = v_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'That checkpoint no longer exists' using errcode = 'P0002';
    end if;
    perform write_audit('checkpoint_changed', 'operational', null, null, null, null, v_id, null,
                        v_name || ' ' || p_start || '-' || p_end);
  end if;
  return v_row;
end $$;

create or replace function set_checkpoint_active(p_id text, p_active boolean) returns checkpoints
language plpgsql security definer set search_path = public as $$
declare v_row checkpoints;
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can change checkpoints' using errcode = '42501';
  end if;
  update checkpoints set active = p_active where id = p_id returning * into v_row;
  if v_row.id is null then
    raise exception 'That checkpoint no longer exists' using errcode = 'P0002';
  end if;
  if p_active then
    -- Bring back the builtin registers it withdrew, then the defaults.
    perform generate_duties(school_today());
    perform generate_duties(school_today() + 1);
  else
    perform refresh_upcoming_duties();
  end if;
  perform write_audit(case when p_active then 'checkpoint_enabled' else 'checkpoint_disabled' end,
                      'operational', null, null, null, null, p_id, null, v_row.name);
  return v_row;
end $$;

-- Deletes a checkpoint nobody has ever been rostered on; anything with history
-- is switched off instead, because its registers reference it.
create or replace function remove_checkpoint(p_id text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can remove checkpoints' using errcode = '42501';
  end if;
  if exists (select 1 from duties x where x.checkpoint_id = p_id
              and (x.state <> 'pending' or exists (select 1 from attendance a where a.duty_id = x.id))) then
    perform set_checkpoint_active(p_id, false);
    return 'deactivated';
  end if;
  delete from duties where checkpoint_id = p_id;
  delete from duty_defaults where checkpoint_id = p_id;
  delete from checkpoints where id = p_id;
  perform write_audit('checkpoint_removed', 'operational', null, null, null, null, p_id);
  return 'deleted';
end $$;

-- ── 6. GROUP (DUTY DEFAULT) RPCs ────────────────────────────────────────────
create or replace function save_duty_default(
  p_id text, p_checkpoint text, p_label text,
  p_class_key text default null, p_scope text default null, p_band text default null,
  p_house text default null, p_members text[] default null, p_excluded text[] default null,
  p_staff text default null, p_days int[] default '{0,1,2,3,4,5,6}'
) returns duty_defaults
language plpgsql security definer set search_path = public as $$
declare
  v_row     duty_defaults;
  v_before  text;
  v_key     text := nullif(trim(coalesce(p_class_key, '')), '');
  v_members text[] := case when cardinality(p_members) > 0 then (select array_agg(distinct m) from unnest(p_members) m) end;
  v_excl    text[] := case when cardinality(p_excluded) > 0 then (select array_agg(distinct m) from unnest(p_excluded) m) end;
  v_days    int[] := (select array_agg(distinct x order by x) from unnest(coalesce(p_days, '{}')) x where x between 0 and 6);
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can change the roster' using errcode = '42501';
  end if;
  if not exists (select 1 from checkpoints where id = p_checkpoint) then
    raise exception 'That checkpoint no longer exists' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_label, ''))) = 0 then
    raise exception 'Give the group a name' using errcode = '22023';
  end if;
  if v_days is null then
    raise exception 'Pick at least one day of the week' using errcode = '22023';
  end if;
  if v_key is not null and v_key <> '*|VEDIC' and v_key !~ '^[0-9]+\|\*$'
     and not exists (select 1 from students where active and grade || '|' || section = v_key) then
    raise exception 'There is no class %', v_key using errcode = '22023';
  end if;
  if v_members is not null and exists (
       select 1 from unnest(v_members) m where not exists (select 1 from students s where s.admission_no = m and s.active)) then
    raise exception 'One of the chosen students is not on the register' using errcode = '22023';
  end if;
  if p_staff is not null and not exists (
       select 1 from staff where id = p_staff and active and role not in ('nurse', 'reception')) then
    raise exception 'Choose an active staff member who marks attendance' using errcode = '22023';
  end if;

  if p_id is null then
    insert into duty_defaults (checkpoint_id, group_label, class_key, scope, band, house,
                               members, excluded, staff_id, days, created_by)
    values (p_checkpoint, trim(p_label), v_key, p_scope, p_band, p_house,
            v_members, v_excl, p_staff, v_days, my_staff_id())
    returning * into v_row;
    perform write_audit('roster_group_added', 'operational', null, null, v_row.staff_id, null, p_checkpoint, null, trim(p_label));
  else
    select staff_id into v_before from duty_defaults where id = p_id;
    update duty_defaults
       set checkpoint_id = p_checkpoint, group_label = trim(p_label), class_key = v_key,
           scope = p_scope, band = p_band, house = p_house, members = v_members,
           excluded = v_excl, staff_id = p_staff, days = v_days, active = true, updated_at = now()
     where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'That group no longer exists' using errcode = 'P0002';
    end if;
    perform write_audit('roster_group_changed', 'operational', null, null, v_row.staff_id, null, p_checkpoint, null, trim(p_label));
  end if;

  perform refresh_upcoming_duties();
  -- The group's marker changed: move the days not yet marked to them.
  if p_id is not null and v_row.staff_id is distinct from v_before and v_row.staff_id is not null then
    update duties set staff_id = v_row.staff_id
     where default_id = v_row.id and state = 'pending' and day >= school_today();
  end if;
  return v_row;
end $$;

create or replace function remove_duty_default(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can change the roster' using errcode = '42501';
  end if;
  update duty_defaults set active = false, updated_at = now() where id = p_id;
  if not found then
    raise exception 'That group no longer exists' using errcode = 'P0002';
  end if;
  perform refresh_upcoming_duties();
  perform write_audit('roster_group_removed', 'operational', null, null, null, null, p_id);
end $$;

-- ── 7. STAFF ────────────────────────────────────────────────────────────────
alter table staff add column if not exists left_on date;

create sequence if not exists staff_id_seq start 200;

-- Adding someone directly, without them asking first. They sign up with this
-- email afterwards and `link_staff_account` (013) joins the login to this row.
-- A coordinator adds teachers only; roles that carry authority are the
-- administrator's to grant, exactly as 013 decided for approvals.
create or replace function add_staff_member(
  p_name text, p_email text, p_phone text default null,
  p_role text default 'teacher', p_class_key text default null
) returns staff
language plpgsql security definer set search_path = public as $$
declare
  v_name  text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role  text := coalesce(nullif(trim(p_role), ''), 'teacher');
  v_key   text := nullif(trim(coalesce(p_class_key, '')), '');
  v_label text;
  v_id    text;
  v_staff staff;
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can add staff' using errcode = '42501';
  end if;
  if my_role() = 'coordinator' and v_role <> 'teacher' then
    raise exception 'A coordinator can add teachers only. Ask the administrator for other roles.' using errcode = '42501';
  end if;
  if v_role not in ('teacher', 'coordinator', 'management', 'nurse', 'reception') then
    raise exception 'Unknown role %', v_role using errcode = '22023';
  end if;
  if length(v_name) < 2 then
    raise exception 'Enter the staff member''s full name' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if exists (select 1 from staff where lower(email) = v_email) then
    raise exception 'A staff record already uses that email' using errcode = '23505';
  end if;
  if v_key is not null then
    if not exists (select 1 from students where active and grade || '|' || section = v_key) then
      raise exception 'There is no class %', v_key using errcode = '22023';
    end if;
    v_label := 'Class ' || split_part(v_key, '|', 1) || ' ' || initcap(lower(split_part(v_key, '|', 2)));
  end if;

  loop
    v_id := 't' || nextval('staff_id_seq');
    exit when not exists (select 1 from staff where id = v_id);
  end loop;

  insert into staff (id, name, role, email, phone, active, auth_user_id, class_key, class_label)
  values (v_id, v_name, v_role, v_email, nullif(trim(coalesce(p_phone, '')), ''), true,
          (select id from auth.users where lower(email) = v_email and email_confirmed_at is not null),
          v_key, v_label)
  returning * into v_staff;

  -- Somebody already in the queue under this address is now answered.
  update staff_requests set state = 'approved', decided_by = my_staff_id(), decided_at = now()
   where lower(email) = v_email and state = 'pending';

  -- `staff_added` is written by 008's trigger on the insert above.
  return v_staff;
end $$;

-- Deactivate = flag + leaving date, never delete (SRS D3). Their pending
-- duties and recurring groups move to the replacement in the same step, so no
-- checkpoint is left pointing at somebody who can no longer sign in.
create or replace function set_staff_active(
  p_staff text, p_active boolean, p_replacement text default null
) returns staff
language plpgsql security definer set search_path = public as $$
declare
  v_t     staff;
  v_rep   text := nullif(trim(coalesce(p_replacement, '')), '');
  v_staff staff;
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can change staff' using errcode = '42501';
  end if;
  select * into v_t from staff where id = p_staff for update;
  if v_t.id is null then
    raise exception 'That staff member no longer exists' using errcode = 'P0002';
  end if;
  if v_t.id = my_staff_id() then
    raise exception 'You cannot deactivate your own account' using errcode = '42501';
  end if;
  if my_role() = 'coordinator' and v_t.role in ('coordinator', 'management', 'admin') then
    raise exception 'Only the administrator can change a % account', v_t.role using errcode = '42501';
  end if;

  if not p_active then
    if exists (select 1 from duties where staff_id = p_staff and state = 'pending' and day >= school_today())
       and v_rep is null then
      raise exception 'Choose who takes over their pending duties' using errcode = '22023';
    end if;
    if v_rep is not null and not exists (
         select 1 from staff where id = v_rep and active and id <> p_staff and role not in ('nurse', 'reception')) then
      raise exception 'Choose an active staff member to take over' using errcode = '22023';
    end if;
    if v_rep is not null then
      update duties set staff_id = v_rep
       where staff_id = p_staff and state = 'pending' and day >= school_today();
    end if;
    update duty_defaults set staff_id = v_rep, updated_at = now() where staff_id = p_staff;
    update staff set active = false, left_on = school_today(), class_key = null, class_label = null
     where id = p_staff returning * into v_staff;
    -- Signed out everywhere. The access token they hold dies with `my_role()`
    -- above; this stops a refresh token minting a new one.
    if v_t.auth_user_id is not null then
      delete from auth.sessions where user_id = v_t.auth_user_id;
    end if;
    perform write_audit('staff_deactivated', 'operational', null, null, p_staff, v_rep, 'active', 'true', 'false');
  else
    update staff set active = true, left_on = null where id = p_staff returning * into v_staff;
    perform write_audit('staff_reactivated', 'operational', null, null, p_staff, null, 'active', 'false', 'true');
  end if;
  return v_staff;
end $$;

-- Inactive staff, for the "Former staff" list. `staff_read_all` serves the
-- active directory; this keeps the inactive rows behind the desk roles.
create or replace function list_inactive_staff() returns setof staff
language sql stable security definer set search_path = public as $$
  select * from staff where not active and is_roster_desk() order by name
$$;

-- ── 8. PASSWORD RESET CODES ─────────────────────────────────────────────────
-- The coordinator never learns the new password. They issue a short code,
-- read it to the teacher in person or on the phone, and the teacher redeems it
-- on the sign-in screen with a password of their own choosing. The code is
-- stored only as a bcrypt hash, works once, dies after 30 minutes or five
-- wrong guesses, and issuing a new one voids the old.
create table if not exists password_resets (
  id         uuid primary key default gen_random_uuid(),
  staff_id   text not null references staff(id),
  code_hash  text not null,
  issued_by  text references staff(id),
  issued_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts   int not null default 0,
  used_at    timestamptz
);
alter table password_resets enable row level security;
-- No policies at all: nobody reads or writes this table except the two
-- functions below.

create or replace function issue_password_reset(p_staff text)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_t      staff;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes    bytea := extensions.gen_random_bytes(8);
  v_code   text := '';
  v_exp    timestamptz := now() + interval '30 minutes';
begin
  if not is_roster_desk() then
    raise exception 'Only a coordinator can reset passwords' using errcode = '42501';
  end if;
  select * into v_t from staff where id = p_staff;
  if v_t.id is null or not v_t.active then
    raise exception 'That staff member is not active' using errcode = 'P0002';
  end if;
  if v_t.id = my_staff_id() then
    raise exception 'Use Change password on your own Account screen' using errcode = '42501';
  end if;
  if my_role() = 'coordinator' and v_t.role in ('coordinator', 'management', 'admin') then
    raise exception 'Only the administrator can reset a % password', v_t.role using errcode = '42501';
  end if;
  if v_t.auth_user_id is null then
    raise exception '% has not created a login yet. Ask them to sign up with %', v_t.name, v_t.email
      using errcode = '22023';
  end if;

  for i in 0..7 loop
    v_code := v_code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;

  update password_resets set used_at = now() where staff_id = p_staff and used_at is null;
  insert into password_resets (staff_id, code_hash, issued_by, expires_at)
  values (p_staff, extensions.crypt(v_code, extensions.gen_salt('bf')), my_staff_id(), v_exp);

  perform write_audit('password_reset_issued', 'operational', null, null, p_staff);
  return query select v_code, v_exp;
end $$;

-- Callable without signing in — the whole point is somebody who cannot.
-- Returns a status rather than raising, because a raise would roll back the
-- attempt counter and make guessing free.
create or replace function redeem_password_reset(p_email text, p_code text, p_password text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t  staff;
  v_r  password_resets;
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if length(coalesce(p_password, '')) < 8 then
    return 'weak';
  end if;
  select * into v_t from staff where lower(email) = lower(trim(coalesce(p_email, ''))) and active;
  if v_t.id is null or v_t.auth_user_id is null then
    return 'invalid';
  end if;
  select * into v_r from password_resets
   where staff_id = v_t.id and used_at is null and expires_at > now()
   order by issued_at desc limit 1 for update;
  if v_r.id is null or v_r.attempts >= 5 then
    return 'invalid';
  end if;
  if extensions.crypt(code, v_r.code_hash) <> v_r.code_hash then
    update password_resets set attempts = attempts + 1 where id = v_r.id;
    return 'invalid';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_t.auth_user_id;
  update password_resets set used_at = now() where id = v_r.id;
  delete from auth.sessions where user_id = v_t.auth_user_id;
  insert into audit_log (actor_id, action, severity, subject_id)
  values (v_t.id, 'password_reset_redeemed', 'operational', v_t.id);
  return 'ok';
end $$;

-- ── 9. GRANTS ───────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'save_checkpoint(text,text,int,int,boolean)', 'set_checkpoint_active(text,boolean)',
    'remove_checkpoint(text)',
    'save_duty_default(text,text,text,text,text,text,text,text[],text[],text,int[])',
    'remove_duty_default(text)', 'add_staff_member(text,text,text,text,text)',
    'set_staff_active(text,boolean,text)', 'list_inactive_staff()', 'issue_password_reset(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on function redeem_password_reset(text, text, text) from public;
grant execute on function redeem_password_reset(text, text, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- (tests/coordinator-rls.test.cjs runs these against the mock project with
-- real user tokens.)
--   teacher  rpc save_checkpoint / save_duty_default / add_staff_member      -> 42501
--   teacher  insert into duty_defaults directly                              -> rejected (no policy)
--   coord    save_duty_default(...)                                          -> row, and today's duty appears
--   coord    remove_duty_default(id)                                         -> today's pending duty is gone
--   coord    add_staff_member(... role 'coordinator')                        -> 42501
--   coord    set_staff_active(teacher, false, null) with pending duties      -> 22023, nothing changed
--   coord    issue_password_reset(coordinator)                               -> 42501
--   anon     select from password_resets                                     -> empty
--   anon     redeem_password_reset(email, wrong code, ...) six times         -> 'invalid'; real code then fails too
--   anon     redeem_password_reset(email, code, 'newpass123')                -> 'ok', signs in with the new password
--   deactivated teacher reads students                                      -> empty
