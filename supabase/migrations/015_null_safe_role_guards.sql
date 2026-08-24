-- 015 — A role guard that says nothing must mean no.
--
-- WHY
-- `my_role()` returns NULL for a caller with no `staff` row. In SQL,
-- `NULL not in ('coordinator','admin')` is not TRUE and not FALSE — it is
-- NULL, and `if NULL then raise ... end if` does not fire. So this shape:
--
--   if my_role() not in ('coordinator','admin') then
--     raise exception 'Only a coordinator can …';
--   end if;
--
-- rejects a teacher and a nurse correctly, and waves through the one caller it
-- most needs to stop: somebody who is not staff at all. It fails OPEN, and it
-- reads exactly like code that fails closed, which is why it survived review.
--
-- WHERE IT WAS
-- `guard_duty_reassignment`, from 005. It is the trigger that stops a covering
-- teacher taking a duty off its owner.
--
-- WAS IT EXPLOITABLE?
-- Not on its own, and this is worth being precise about rather than alarming:
-- for the trigger to fire at all, an UPDATE has to get past `duties_update`
-- from 005, whose WITH CHECK is `my_staff_id() is not null`. A caller with no
-- staff row is stopped one layer earlier and never reaches the guard. So this
-- is a latent fault, not an open door.
--
-- It is being fixed anyway, because "another layer happens to catch it" is
-- precisely what was true of 012's `using (true)` right up until self-service
-- signup made it false. A guard should be correct on its own terms.
--
-- The same shape was found and fixed in 013 and 014 before either was applied.

create or replace function guard_duty_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is distinct from old.staff_id
     and coalesce(my_role(), '') not in ('coordinator','admin') then
    raise exception 'Only a coordinator can reassign a duty'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The trigger itself is unchanged and still points at this function; replacing
-- the body is enough. Recreating it here anyway would risk a window in which
-- reassignment is unguarded.

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- With a teacher token, on a duty belonging to someone else:
--   update duties set staff_id = '<own id>' where id = '<their duty>';
--     -> still fails, 42501   (this is the case that already worked)
--
-- With a coordinator token:
--   the same update -> still succeeds
--
-- There is no easy hand-test for the NULL case, because RLS blocks it before
-- the trigger runs — which is the point of the note above.
