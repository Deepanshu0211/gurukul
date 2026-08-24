-- 016 — Give a teacher their class at the moment they are approved.
--
-- WHY
-- A new teacher was landing with `class_key` null, which means no "Records"
-- view of their own class and — more to the point — none of the reads that 004
-- grants. Someone then had to remember to set it later, by hand, in the
-- dashboard. The coordinator approving the request is the person who knows
-- which class it is, and approval is the moment they are thinking about it.
--
-- THIS IS A SECOND PERMISSION, NOT A LABEL
-- `class_key` is not decoration. 004's `duties_select_class_teacher` and
-- `attendance_select_class_teacher` both key off `my_class_key()`, so setting
-- it grants read access to that class's attendance across every checkpoint and
-- every past day, whoever marked it. Approving with a class is therefore two
-- grants in one tap, and the app says so in as many words before the tap.
--
-- WHAT IS VALIDATED
-- The key has to match a class that actually has students in it. A typo would
-- otherwise produce a staff row pointing at a class that does not exist —
-- harmless, but it fails silently and looks like the app losing the setting.
--
-- WHAT IS DELIBERATELY NOT VALIDATED
-- Whether the class already has a teacher. Two staff sharing a class is a real
-- arrangement — a class teacher and an assistant — and a database that refused
-- it would be inventing a school rule nobody asked for. The app shows the
-- coordinator who currently holds a class so the decision is informed rather
-- than blocked.

-- The 1-argument version has to go, not just be replaced: adding a defaulted
-- parameter creates an OVERLOAD, and PostgREST would then have two candidates
-- for a call carrying only `p_request`.
drop function if exists approve_staff_request(uuid);

create or replace function approve_staff_request(
  p_request   uuid,
  p_class_key text default null
)
returns staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   staff_requests;
  v_id    text;
  v_uid   uuid;
  v_key   text := nullif(trim(p_class_key), '');
  v_label text;
  v_staff staff;
begin
  -- `coalesce`, and not `my_role() not in (…)`: a caller with no staff row
  -- makes `my_role()` NULL, `NULL not in (…)` is NULL, and `if NULL then` does
  -- not fire. See 015.
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

  -- Must be a class that exists. Uses `students_class_key_idx` from 004.
  if v_key is not null then
    if not exists (
      select 1 from students
       where active and grade || '|' || section = v_key
    ) then
      raise exception 'There is no class %', v_key using errcode = '22023';
    end if;

    -- 'Class 9 Balram' from '9|BALRAM', matching the wording seed.sql uses.
    v_label := 'Class ' || split_part(v_key, '|', 1) || ' '
                        || initcap(lower(split_part(v_key, '|', 2)));
  end if;

  v_uid := coalesce(
    v_req.auth_user_id,
    (select id from auth.users
      where lower(email) = lower(v_req.email) and email_confirmed_at is not null)
  );

  loop
    v_id := 't' || nextval('staff_id_seq');
    exit when not exists (select 1 from staff where id = v_id);
  end loop;

  insert into staff (id, name, role, email, phone, active, auth_user_id,
                     class_key, class_label)
  values (v_id, v_req.name, 'teacher', lower(v_req.email), v_req.phone, true,
          v_uid, v_key, v_label)
  returning * into v_staff;

  update staff_requests
     set state = 'approved', decided_by = my_staff_id(), decided_at = now(),
         auth_user_id = coalesce(auth_user_id, v_uid)
   where id = p_request;

  perform write_audit('access_approved', 'operational', null, null,
                      v_id, null, 'role', null, 'teacher');

  -- Logged separately from the role, because it is a separate grant and the
  -- log should be able to answer "who gave them class 9 Balram" on its own.
  if v_key is not null then
    perform write_audit('class_assigned', 'operational', null, null,
                        v_id, null, 'class_key', null, v_key);
  end if;

  return v_staff;
end;
$$;

revoke execute on function approve_staff_request(uuid, text) from public;
grant  execute on function approve_staff_request(uuid, text) to authenticated;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- As a coordinator:
--   1. approve_staff_request(<id>, '4|A')
--        -> staff row, class_key '4|A', class_label 'Class 4 A'
--   2. approve_staff_request(<id>, '99|ZZ')
--        -> fails, 'There is no class 99|ZZ', and NO staff row is created
--   3. approve_staff_request(<id>, null)
--        -> staff row with class_key null, exactly as before this migration
--   4. select action, subject_id, new_value from audit_log
--        where action in ('access_approved','class_assigned') order by at desc
--        -> two rows for case 1, one row for case 3
--
-- Then as the approved teacher, once they have signed in:
--   5. read attendance for a student in their class, on a duty that belongs to
--      somebody else -> succeeds (this is what 004 grants)
--   6. read attendance for a student in a DIFFERENT class -> zero rows
