-- seed-marks-today.sql
--
-- TEST DATA. A full day of attendance, marked and submitted, so the screens
-- can be read at real size before the school's own register arrives.
--
-- Every duty dated today is filled in and submitted. The spread of statuses
-- follows the school's 31.07.26 sheet rather than being uniform noise: almost
-- everyone present, one or two residential absences, a dozen day scholars
-- absent, a few sick, a few at home or Gita Nagari.
--
-- Deterministic. The status for a child at a checkpoint is derived from a hash
-- of their admission number and the duty id, so re-running produces the same
-- day rather than a fresh one, and the same child is absent at breakfast and
-- at morning attendance the way a real absence behaves.
--
-- Requires seed-mock-school.sql to have been run first (it creates the duties
-- this fills in). Safe to re-run: every row upserts and the deletes below are
-- scoped to today only.

begin;

alter table attendance disable trigger user;
alter table duties     disable trigger user;

-- Today only. Yesterday's marks, if anyone made any, are left alone.
delete from attendance a
 using duties d
 where a.duty_id = d.id and d.day = school_today();

-- ── WHO EACH DUTY COVERS ────────────────────────────────────────────────────
-- Mirrors resolveGroup() in src/lib/duties.js. A duty carries at most one of
-- class_key / (scope + band + house): a class is already a single group, so
-- class_key is exclusive, while scope, band and house compose.
with roster as (
  select d.id as duty_id, s.admission_no
    from duties d
    join students s on s.active
   where d.day = school_today()
     and (
          -- A class duty: exactly that class.
          (d.class_key is not null and d.class_key = s.grade || '|' || s.section)
          or
          -- Otherwise scope, then band, then house, each narrowing the pool.
          (d.class_key is null
           and (d.scope is null
                or (d.scope = 'res' and s.stype <> 'Day Scholar')
                or  d.scope = 'all')
           and (d.band is null
                or (d.band = 'Primary' and s.grade between 2 and 5)
                or (d.band = 'Middle'  and s.grade between 6 and 8)
                or (d.band = 'Senior'  and s.grade between 9 and 12))
           and (d.house is null or d.house = s.house))
         )
),

-- A stable number in [0,1) per child per checkpoint. hashtext is deterministic
-- within a Postgres major version, which is all this needs — the point is a
-- repeatable day, not a cryptographic one.
dice as (
  select duty_id,
         admission_no,
         (abs(hashtext(admission_no || '|' || duty_id)) % 10000) / 10000.0 as r,
         -- A second, checkpoint-independent roll: a child who is away is away
         -- all day, so Home and Gita Nagari have to persist across checkpoints
         -- rather than being re-rolled at each one. Those are the `spanning`
         -- statuses in seed.sql.
         (abs(hashtext(admission_no)) % 10000) / 10000.0 as r_day
    from roster
)

insert into attendance (duty_id, admission_no, status)
select
  d.duty_id,
  d.admission_no,
  case
    -- Away all day, same child at every checkpoint.
    when d.r_day < 0.012 then 'H'   -- at home
    when d.r_day < 0.018 then 'G'   -- Gita Nagari
    when d.r_day < 0.028 then 'S'   -- infirmary
    -- Absent at this checkpoint only, and rarer.
    when d.r      < 0.030 then 'A'
    when d.r      < 0.038 then 'V'  -- activity: in school, counted present
    else null                        -- present
  end
from dice d
on conflict (duty_id, admission_no) do update set status = excluded.status;

-- ── SUBMIT THEM ─────────────────────────────────────────────────────────────
-- A duty with marks but state 'pending' is a half-finished checkpoint, which
-- is a real state worth testing but not the one this file is for.
update duties d
   set state = 'submitted',
       submitted_by = d.staff_id,
       submitted_at = (school_today() + make_interval(mins => c.start_min + 4))
  from checkpoints c
 where c.id = d.checkpoint_id
   and d.day = school_today();

alter table attendance enable trigger user;
alter table duties     enable trigger user;

commit;

-- ── CHECK ───────────────────────────────────────────────────────────────────
-- `rows today` is the number that matters for the client: PostgREST returns at
-- most 1000 rows per request by default, so any screen that reads a whole day
-- in one query truncates silently above that.
select 'duties today'  as what, count(*)::text as n from duties where day = school_today()
union all select 'submitted',   count(*)::text from duties where day = school_today() and state = 'submitted'
union all select 'rows today',  count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today()
union all select 'present',     count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today() and a.status is null
union all select 'absent (A)',  count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today() and a.status = 'A'
union all select 'sick (S)',    count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today() and a.status = 'S'
union all select 'home (H)',    count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today() and a.status = 'H'
union all select 'gita (G)',    count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today() and a.status = 'G'
union all select 'activity (V)',count(*)::text from attendance a join duties d on d.id = a.duty_id where d.day = school_today() and a.status = 'V';
