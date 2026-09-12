-- 030 — A class has one class teacher, and a class with none does not break
--       the whole school's morning.
--
-- THE SYMPTOM
-- A coordinator approves a teacher and gives them Class 2. The teacher signs
-- in and has no Class 2 duty. It looks exactly like the assignment was not
-- saved, and the natural response is to assign it again — which changes
-- nothing, because it was saved the first time.
--
-- THE CAUSE
-- `staff.class_key` had no uniqueness of any kind, so two people could hold
-- '2|A' at once. Everything downstream then had to guess which one meant it:
--
--   generate_duties (024)      picks min(id) — the older row keeps the duty
--                              and the newly assigned teacher gets nothing
--   class_status_board (020)   shows both names in one cell
--   the printed register       has one "Class Teacher" column and one line
--
-- Guessing consistently is not the same as being right. The school's own form
-- has one name per class, so the database should too.
--
-- AND A WORSE ONE, FOUND WHILE FIXING IT
-- `generate_duties` selected the class teacher through a LEFT join and fed the
-- result straight into `duties.staff_id`, which is `not null`. A class with no
-- teacher therefore did not produce an unrostered duty — it aborted the whole
-- INSERT, and with it the entire nightly run. One teacher leaving in October
-- would have left EVERY class in the school with no checkpoints the next
-- morning, from a NOT NULL violation at half past midnight that nobody saw.
--
-- An unstaffed class now falls back to the Ashram Coordinator, who is the
-- person sorting it out anyway.
--
-- WHAT IS DELIBERATELY NOT DONE
-- Nothing already submitted is touched and no past day is re-rostered. A
-- submitted register records who actually marked it; rewriting that to match a
-- staffing decision made in September would be a lie about the past.

-- ── ONE TEACHER PER CLASS ───────────────────────────────────────────────────
create or replace function staff_one_class_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_key is null then
    return new;
  end if;

  -- Take the class off anyone else holding it. Clearing their class_key fires
  -- this trigger again, once, and returns at the guard above — so it
  -- terminates rather than recursing.
  update staff
     set class_key = null, class_label = null
   where class_key = new.class_key
     and id <> new.id;

  return new;
end;
$$;

drop trigger if exists staff_one_class_teacher on staff;
create trigger staff_one_class_teacher
  before insert or update of class_key on staff
  for each row execute function staff_one_class_teacher();

-- ── MOVE THE DAYS THAT HAVE NOT HAPPENED ────────────────────────────────────
-- AFTER, because it writes to `duties` rather than to the row being saved.
--
-- `state = 'pending'` and `day >= school_today()` together are the safety
-- rule. A submitted duty names whoever submitted it; a past duty names who was
-- responsible that day. Neither is ours to rewrite.
--
-- There is deliberately NO branch for a teacher who LOSES a class. The obvious
-- one — setting those duties' staff_id to null — cannot work, because the
-- column is `not null`; the first draft of this migration tried exactly that
-- and failed on it. Leaving the duty pointing at the outgoing teacher is also
-- right on its own terms: somebody has to be answerable for it until a
-- coordinator says otherwise, and the moment a replacement is assigned the
-- branch below moves it to them.
create or replace function staff_reroster_pending_duties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_key is not null then
    update duties
       set staff_id = new.id
     where class_key = new.class_key
       and day >= school_today()
       and state = 'pending'
       and staff_id is distinct from new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists staff_reroster_pending_duties on staff;
create trigger staff_reroster_pending_duties
  after insert or update of class_key on staff
  for each row execute function staff_reroster_pending_duties();

-- ── AN UNSTAFFED CLASS MUST NOT ABORT THE NIGHT ─────────────────────────────
-- Identical to 024 except for the coalesce on the last column. Replaced whole
-- rather than patched, so the function reads as one piece.
create or replace function generate_duties(p_day date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d     date := coalesce(p_day, school_today());
  stamp text := to_char(d, 'YYYYMMDD');
  n     int;
begin
  insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
  select
    'morn-' || replace(k.class_key, '|', '-') || '-' || stamp,
    'morning',
    d,
    case when split_part(k.class_key, '|', 2) = 'A'
         then 'Class ' || split_part(k.class_key, '|', 1)
         else 'Class ' || split_part(k.class_key, '|', 1) || ' ' ||
              initcap(lower(split_part(k.class_key, '|', 2)))
    end,
    k.class_key,
    null, null, null,
    -- The fallback that keeps the morning alive. `duties.staff_id` is not
    -- null, so without this a single class between teachers takes down the
    -- whole night's generation, for every class.
    coalesce(t.id, 'c1')
  from (select distinct grade || '|' || section as class_key from students where active) k
  left join lateral (
    -- The trigger above makes two holders impossible, so this is now a single
    -- row rather than an arbitrary choice between two. Kept as min() because
    -- the data only became unambiguous a moment ago and older copies exist.
    select min(id) as id from staff where class_key = k.class_key
  ) t on true
  on conflict (id) do update
    set group_label = excluded.group_label,
        class_key   = excluded.class_key,
        staff_id    = coalesce(duties.staff_id, excluded.staff_id);

  insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id)
  select v.id || '-' || stamp, v.cp, d, v.label, null, v.scope, v.band, null,
         coalesce((select id from staff where id = v.staff), 'c1')
  from (values
    ('mang',      'mang',      'All residential students', 'res', null,      'c1'),
    ('bfast-pri', 'breakfast', 'Primary · residential',    'res', 'Primary', 'd1'),
    ('bfast-mid', 'breakfast', 'Middle · residential',     'res', 'Middle',  'd2'),
    ('bfast-sr',  'breakfast', 'Senior · residential',     'res', 'Senior',  'd3'),
    ('lunch-all', 'lunch',     'Whole school',             'all', null,      'c1'),
    ('night-res', 'night',     'All residential students', 'res', null,      'c2')
  ) as v(id, cp, label, scope, band, staff)
  on conflict (id) do update
    set group_label = excluded.group_label,
        scope       = excluded.scope,
        band        = excluded.band,
        staff_id    = coalesce(duties.staff_id, excluded.staff_id);

  select count(*) into n from duties where day = d;
  return n;
end;
$$;

-- ── CLEAN UP WHAT IS ALREADY DOUBLED ────────────────────────────────────────
-- Triggers off on `duties` for the rest of this file. Both statements below
-- end up writing to it — the staff UPDATE reaches it through the AFTER trigger
-- just created — and `duties` carries a guard refusing a reassignment unless
-- the caller is a coordinator (002/005). A migration has no role attached, so
-- my_role() is null and the guard correctly refuses. It is doing its job; this
-- is the one caller that legitimately sits outside it.
--
-- The runtime path is unaffected: when a coordinator assigns a class in the
-- app the trigger runs inside their session, and the guard sees a coordinator,
-- which is exactly what it is there to check.
alter table duties disable trigger user;

-- The most recently assigned holder keeps the class, which is what the
-- coordinator who assigned it meant. Ordering by id alone is not enough —
-- 't104' sorts before 't2' as text — so length first, which is how the
-- sequence-generated ids grow.
with ranked as (
  select id, class_key,
         row_number() over (
           partition by class_key
           order by length(id) desc, id desc
         ) as rn
    from staff
   where class_key is not null
)
update staff s
   set class_key = null, class_label = null
  from ranked r
 where s.id = r.id and r.rn > 1;

-- Re-roster today and tomorrow to match.
update duties d
   set staff_id = t.id
  from staff t
 where t.class_key = d.class_key
   and d.day >= school_today()
   and d.state = 'pending'
   and d.staff_id is distinct from t.id;

alter table duties enable trigger user;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select class_key, count(*) from staff
--    where class_key is not null group by class_key having count(*) > 1;
--   -> no rows, now and after any assignment
--
-- The case this fixes, end to end:
--   update staff set class_key = '2|A', class_label = 'Class 2' where id = 't104';
--   select id from staff where class_key = '2|A';               -- only t104
--   select staff_id from duties
--    where class_key = '2|A' and day = school_today();           -- t104
--
-- The one that would have taken down a morning:
--   update staff set class_key = null where id = 't104';
--   select generate_duties(school_today() + 2);                  -- succeeds
--   select staff_id from duties
--    where class_key = '2|A' and day = school_today() + 2;       -- 'c1'
--
-- Before this, that second call raised
--   null value in column "staff_id" of relation "duties" violates not-null
-- and created no duties at all, for any class.
