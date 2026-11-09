-- 047 — Every sign-out and sign-in at the gate reaches the people in charge.
--
-- THE PROBLEM
-- Since 039 a teacher can sign a child out to family. That is the right call
-- for the teacher who is standing there, but it means a child can leave the
-- campus without a coordinator, the MOD or the Principal's office hearing of
-- it until they happen to open the Gate screen. The school asked for every
-- sign-out and sign-in to reach them, and for a place to read back any they
-- missed.
--
-- THE SHAPE
--   * `notifications` — one row per event, written ONLY by a trigger on
--     `student_leave`. There is no INSERT/UPDATE/DELETE policy, so nobody can
--     forge, edit or delete one from the app. The row is the record; it is
--     not deleted when read.
--   * `notification_reads` — who has seen which. Per person, so one
--     coordinator reading a notice does not hide it from the other.
--   * Who receives them: coordinator, management (MOD) and admin — the roles
--     a missing child escalates to. Teachers, nurse and reception do not read
--     this table; they read the Gate screen.
--   * The person who did the sign-out/in has it marked read for them already —
--     a coordinator signing a child out is not told about it by their own app.
--   * Added to the `supabase_realtime` publication so open apps hear it at
--     once. Realtime applies the SELECT policy below, so a teacher's socket
--     receives nothing.
--
-- Re-runnable.

begin;

create table if not exists notifications (
  id           bigserial primary key,
  kind         text not null check (kind in ('student_out','student_in')),
  admission_no text not null references students(admission_no),
  leave_id     bigint references student_leave(id) on delete set null,
  status       text,
  reason       text,
  expected_back date,
  actor        text references staff(id),
  actor_role   text,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_created_idx on notifications (created_at desc);

create table if not exists notification_reads (
  notification_id bigint not null references notifications(id) on delete cascade,
  staff_id        text   not null references staff(id),
  read_at         timestamptz not null default now(),
  primary key (notification_id, staff_id)
);

alter table notifications      enable row level security;
alter table notification_reads enable row level security;

-- One spelling of "receives gate notices", used by both policies and the RPCs.
create or replace function receives_notifications() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role(), '') in ('coordinator','management','admin') $$;

drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications
  for select to authenticated
  using (receives_notifications());

-- Your own read-marks only. Written through the RPCs below.
drop policy if exists notification_reads_own on notification_reads;
create policy notification_reads_own on notification_reads
  for select to authenticated
  using (staff_id = my_staff_id());

revoke insert, update, delete on notifications      from anon, authenticated;
revoke insert, update, delete on notification_reads from anon, authenticated;

-- ── THE TRIGGER ─────────────────────────────────────────────────────────────
create or replace function notify_gate_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_id  bigint;
  who   text;
  kind  text;
begin
  if tg_op = 'INSERT' then
    kind := 'student_out';
    who  := new.out_by;
  elsif tg_op = 'UPDATE' and old.in_at is null and new.in_at is not null then
    kind := 'student_in';
    who  := new.in_by;
  else
    return new;
  end if;

  insert into notifications (kind, admission_no, leave_id, status, reason, expected_back, actor, actor_role)
  values (kind, new.admission_no, new.id, new.status, new.reason, new.expected_back,
          who, (select role from staff where id = who))
  returning id into n_id;

  -- The person who did it does not need telling.
  if who is not null then
    insert into notification_reads (notification_id, staff_id)
    values (n_id, who) on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists student_leave_notify on student_leave;
create trigger student_leave_notify
  after insert or update of in_at on student_leave
  for each row execute function notify_gate_event();

-- ── READ MARKS ──────────────────────────────────────────────────────────────
create or replace function mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  me  text := my_staff_id();
  n   integer;
begin
  if me is null or not receives_notifications() then
    raise exception 'Only a coordinator, the MOD or an administrator receives gate notifications.'
      using errcode = '42501';
  end if;

  -- NULL means "all of them".
  insert into notification_reads (notification_id, staff_id)
  select id, me from notifications
   where p_ids is null or id = any(p_ids)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function mark_notifications_read(bigint[]) from public;
grant execute on function mark_notifications_read(bigint[]) to authenticated;

-- ── REALTIME ────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table notifications';
  end if;
end $$;

commit;

-- ── VERIFY (CLAUDE.md §5.1 — with real tokens, not by reading this file) ────
--   tests/gate-notifications.test.cjs does all of this against the mock project:
--   1. Teacher signs a child out  -> coordinator sees a 'student_out' notice, unread
--   2. Teacher selects notifications -> zero rows
--   3. Teacher inserts into notifications directly -> refused
--   4. Coordinator marks it read -> read for them, still unread for the admin
--   5. Teacher signs them back in -> 'student_in' notice
