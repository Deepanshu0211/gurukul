-- 010 — Submitting a checkpoint becomes one atomic operation.
--
-- WHY
-- `submitDuty` in the app was two round trips: upsert every student's mark,
-- then flip the duty to 'submitted'. Two statements, two transactions. Lose
-- signal, background the app, or have the phone die between them and the
-- attendance is saved while the duty still reads 'pending' — a checkpoint
-- that looks unmarked but is full of marks. Nobody would notice: the teacher
-- sees "not submitted" and marks it again; the coordinator's dashboard counts
-- it as overdue and escalates; the child's actual attendance is sitting in the
-- table the whole time.
--
-- A function body runs inside the calling statement's transaction, and
-- PostgREST gives each RPC its own transaction, so this call either does
-- everything or does nothing.
--
-- WHAT ELSE IT FIXES
--   * `submitted_by` is now resolved server-side from the caller's token
--     rather than passed up from the client. The app can no longer name
--     somebody else as the person who marked a checkpoint, even by accident.
--   * `for update` locks the duty row, so two teachers hitting Submit on the
--     same checkpoint at once serialise instead of interleaving.
--   * Submission and correction are one path. The app used to have two
--     functions writing overlapping columns; the difference is now a branch
--     on the duty's own state, decided by the database.
--
-- WHAT DOES NOT CHANGE
--   * `security invoker`, so every policy from 002/005/006 still applies to
--     the writes inside. This adds atomicity, not authority.
--   * The audit triggers fire exactly as before, because the ORDER is
--     preserved: marks are written while the duty is still pending (so the
--     original submission is not logged as a correction), and the state flip
--     happens after.
--
-- TESTING (do not skip — see the header of 002):
--   1. Teacher submits a pending duty  -> state submitted, submitted_by = them,
--      one 'duty_submitted' audit row, no 'attendance_override' rows
--   2. Teacher submits an ALREADY submitted duty -> must FAIL (42501)
--   3. Coordinator calls it on a submitted duty -> marks change,
--      corrected_by set, one 'attendance_override' row PER CHANGED MARK only
--   4. Call it twice with identical marks -> second call returns changed = 0
--      and writes no audit rows
--   5. Kill the connection mid-call -> duty stays pending AND no marks land

create or replace function submit_duty(p_duty_id text, p_marks jsonb)
returns table (marked int, changed int, absent int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  d           duties%rowtype;
  v_marked    int;
  v_changed   int;
  v_absent    int;
  correcting  boolean;
begin
  if jsonb_typeof(p_marks) is distinct from 'array' then
    raise exception 'Marks must be a JSON array of {admission_no, status}.'
      using errcode = '22023';
  end if;

  -- `for update` holds the row for the rest of the transaction. Two people
  -- submitting the same checkpoint at the same moment is not hypothetical:
  -- cover marking means a duty teacher and a colleague can both be looking at
  -- it, and without this their marks could interleave.
  select * into d from duties where id = p_duty_id for update;
  if not found then
    raise exception 'That duty no longer exists.' using errcode = 'P0002';
  end if;

  correcting := (d.state = 'submitted');

  -- A submitted record is final unless the caller may overrule it. The RLS
  -- policies would refuse the write anyway; this turns a silent zero-row
  -- update into a message the app can show.
  if correcting and not can_override() then
    raise exception 'This checkpoint has already been submitted.'
      using errcode = '42501';
  end if;

  -- Counted BEFORE the write, against what is currently stored. On a
  -- correction this is the number the confirmation dialog quotes, and it is
  -- also how "changed nothing" is detected.
  with incoming as (
    select m->>'admission_no' as admission_no,
           nullif(m->>'status', '') as status
      from jsonb_array_elements(p_marks) as m
  )
  select count(*)
    into v_changed
    from incoming i
    left join attendance a
      on a.duty_id = p_duty_id
     and a.admission_no = i.admission_no
   where a.admission_no is null
      or a.status is distinct from i.status;

  -- Every student in the group gets a row, including the present ones (stored
  -- as a null status). That is what makes "was this child checked at all?"
  -- answerable, and it is why the report queries can treat a missing row as
  -- "not in this checkpoint's group" rather than "present".
  --
  -- The trigger on `attendance` skips rows whose status did not actually
  -- change, so re-writing the whole group during a correction still produces
  -- one audit entry per genuinely changed mark.
  with incoming as (
    select m->>'admission_no' as admission_no,
           nullif(m->>'status', '') as status
      from jsonb_array_elements(p_marks) as m
  )
  insert into attendance (duty_id, admission_no, status)
  select p_duty_id, i.admission_no, i.status from incoming i
  on conflict (duty_id, admission_no)
  do update set status = excluded.status;

  get diagnostics v_marked = row_count;

  if correcting then
    -- `submitted_by` is deliberately untouched: the teacher who marked the
    -- checkpoint stays its author, and the corrector is recorded beside them.
    update duties
       set corrected_by = my_staff_id(),
           corrected_at = now()
     where id = p_duty_id;
  else
    update duties
       set state        = 'submitted',
           submitted_by = my_staff_id(),
           submitted_at = now()
     where id = p_duty_id;
  end if;

  select count(*) filter (where a.status = 'A')
    into v_absent
    from attendance a
   where a.duty_id = p_duty_id;

  return query select v_marked, v_changed, v_absent;
end;
$$;

grant execute on function submit_duty(text, jsonb) to authenticated;
