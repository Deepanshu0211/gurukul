-- 032 — A teacher's own marking record, in one query instead of three joins.
--
-- THE BUG
-- The Account screen showed 0 checkpoints, 0 students, 0 absences for a teacher
-- who had submitted twenty-four registers.
--
-- `fetchMarkingTotals` ran three counts. The first — duties submitted — was
-- correct. The other two counted `attendance` through an embedded inner join:
--
--   .select("*, duties!inner(submitted_by, state)", { count: "exact", head: true })
--   .eq("duties.submitted_by", staffId)
--
-- PostgREST turns that into a count over the join of attendance to duties. With
-- one day in the database that is 1,700 rows and answers instantly. With a
-- month of history it is 46,000, and it times out — a 500 from the gateway.
--
-- `useMarkingTotals` catches any failure and sets ALL THREE to zero, so one slow
-- query erased the count that had worked. The screen said a teacher had never
-- marked anything.
--
-- Not a display bug: it would have grown worse every week of term, and it read
-- as "the app lost my work".
--
-- THE FIX
-- One statement, counted where the rows are. `security definer` so it does not
-- re-enter the RLS policies for every one of those rows, and narrow enough that
-- this costs nothing: it answers only about the staff id passed in, and returns
-- three integers.

create or replace function marking_totals(p_staff text)
returns table (taken int, marked int, absent int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from duties d
      where d.submitted_by = p_staff and d.state = 'submitted'),
    (select count(*)::int from attendance a
       join duties d on d.id = a.duty_id
      where d.submitted_by = p_staff and d.state = 'submitted'),
    (select count(*)::int from attendance a
       join duties d on d.id = a.duty_id
      where d.submitted_by = p_staff and d.state = 'submitted' and a.status = 'A');
$$;

revoke all on function marking_totals(text) from public;
grant execute on function marking_totals(text) to authenticated;

-- The index the two attendance counts need. Without it each one is a sequential
-- scan of every mark in the school's history, which is what made the old query
-- slow enough to time out in the first place.
create index if not exists duties_submitted_by_state_idx
  on duties (submitted_by, state);

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select * from marking_totals('t1');
--   -> 24 | 703 | 18      (not 0 | 0 | 0)
--
-- And that it is fast: `explain analyze` should report single-digit
-- milliseconds, against the seconds the embedded-join count took.
