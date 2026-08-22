-- 011 — Headcount: the coordinator's question, answered by the database.
--
-- WHY
-- A class teacher reads a register: thirty names, one row each, and the marks
-- beside them. A coordinator does not. They are covering ten checkpoints and
-- seven hundred children, and the only question that fits on a page is "did
-- the numbers add up, and if not, who and why". Printing the full grid for
-- them means fifteen pages to answer a question that fits on one.
--
-- WHAT THIS IS
-- One function returning a row per checkpoint per day: strength, present,
-- absent, elsewhere. No new stored data — it groups `attendance_detail`, so
-- a headcount can never disagree with the register it was counted from.
--
-- WHY IT IS SQL AND NOT JAVASCRIPT
-- The app could page the marks down and count them in the client, and that is
-- what it did while this was a class-teacher feature. A day is seven hundred
-- students across ten checkpoints — seven thousand rows, eight round trips
-- past PostgREST's 1000-row cap — every one of them fetched to be added up
-- and thrown away. `count(*) filter (...)` does it in one request, and a week
-- costs the same one request.
--
-- SECURITY
-- `security invoker`, like everything in 009: RLS on `attendance`, `duties`
-- and `students` still decides which marks are counted. A role that cannot
-- read a mark cannot see it in a total either. This adds convenience, never
-- authority.

-- ── COUNTS PER CHECKPOINT ───────────────────────────────────────────────────
-- `elsewhere` is every accounted-for status that is not Absent — Home, Sick,
-- Outing, Activity, Gita Nagari, Self study. It is deliberately one number
-- here: the breakdown by reason belongs beside the names on the printed
-- sheet, where it can be acted on, not in a column of small totals.
create or replace function attendance_headcount(
  p_from date default current_date,
  p_to   date default current_date
)
returns table (
  day         date,
  duty_id     text,
  checkpoint  text,
  start_min   int,
  group_label text,
  strength    bigint,
  present     bigint,
  absent      bigint,
  elsewhere   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ad.day,
    ad.duty_id,
    ad.checkpoint,
    ad.start_min,
    ad.group_label,
    count(*),
    count(*) filter (where ad.present),
    count(*) filter (where ad.status = 'A'),
    count(*) filter (where not ad.present and ad.status <> 'A')
  from attendance_detail ad
  where ad.day between p_from and p_to
  group by ad.day, ad.duty_id, ad.checkpoint, ad.start_min, ad.group_label
  -- Chronological, which is the order the day happened in and the order the
  -- printed sheet numbers its checkpoints.
  order by ad.day, ad.start_min, ad.checkpoint;
$$;

grant execute on function attendance_headcount(date, date) to authenticated;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- With a coordinator token:
--   select * from attendance_headcount(current_date, current_date);
--   -> one row per submitted checkpoint; strength = present + absent + elsewhere
--
-- With a plain teacher token, the same call must return the same rows (005
-- made attendance school-wide readable). If it returns fewer, RLS is tighter
-- than 005 describes and the printed headcount would silently under-count —
-- stop and reconcile before anyone files one of these sheets.
