-- 022 — Tell a teacher why the write was refused, not that her class vanished.
--
-- THE BUG
-- `submit_duty` (010) locks the duty with
--
--   select * into d from duties where id = p_duty_id for update;
--   if not found then raise exception 'That duty no longer exists.'
--
-- It is `security invoker`, which is right — every policy in 002/005/006 must
-- still apply. But `for update` is filtered by those policies too, so a row
-- the caller may READ and may not WRITE comes back as `not found`, and the
-- function blames a missing record for what is really a permission decision.
--
-- Three different refusals all arrived on the phone as
--
--   "That duty no longer exists."
--
--   * a class teacher correcting her own already-submitted register
--   * a class teacher opening someone else's class
--   * the nurse, who may read the board but never write to it
--
-- The first one is the one that matters. A teacher who submits at 7:45, spots
-- a mistake at 7:50 and is told her class's attendance no longer exists has
-- been told the school lost the register. She rings the office. The office
-- finds the data perfectly intact and nobody learns anything, because the
-- message described a failure that did not happen.
--
-- The guard below it — "This checkpoint has already been submitted." — was
-- meant to catch exactly this case and never fired, because the row was
-- already invisible by the time control reached it.
--
-- THE FIX
-- Ask, without RLS, whether the duty exists at all, and only then choose the
-- message. Existence and permission are different answers and the person
-- holding the phone needs to be able to tell them apart.

-- ── DOES THIS DUTY EXIST? ───────────────────────────────────────────────────
-- `security definer` so it sees past the policies, and deliberately narrow: it
-- takes an id the caller has already named and returns only that duty's state.
-- It exposes no roster, no marks, and nothing about a duty whose id you cannot
-- already guess. That is the whole surface, and it buys an honest error.
create or replace function duty_state_unfiltered(p_duty_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select state from duties where id = p_duty_id;
$$;

revoke all on function duty_state_unfiltered(text) from public;
grant execute on function duty_state_unfiltered(text) to authenticated;

-- ── THE CORRECTED GUARD ─────────────────────────────────────────────────────
-- Replaces only the lookup block of 010. Everything else in submit_duty — the
-- lock, the atomic upsert, the counts, the audit — is unchanged, so this file
-- must be applied AFTER 010 and re-applies the whole function body to do it.
do $$
declare
  body text;
begin
  -- Guard rather than assume: applying this to a database that never got 010
  -- would otherwise create a broken function and only fail at the first
  -- checkpoint of the morning.
  if to_regprocedure('public.submit_duty(text,jsonb)') is null then
    raise exception 'submit_duty(text,jsonb) does not exist — run 010 first.';
  end if;

  select prosrc into body from pg_proc
   where oid = 'public.submit_duty(text,jsonb)'::regprocedure;

  if position('duty_state_unfiltered' in body) > 0 then
    raise notice '022 already applied; leaving submit_duty alone.';
    return;
  end if;

  -- Replacing ONE LINE, not the surrounding block. 010 was committed with
  -- CRLF line endings and is stored that way in pg_proc, so any literal
  -- spanning more than one line silently fails to match from an LF file and
  -- this migration reports success having changed nothing. A single line has
  -- no newline in it to disagree about.
  if position($old$raise exception 'That duty no longer exists.' using errcode = 'P0002';$old$ in body) = 0 then
    raise exception '022: could not find the guard to replace in submit_duty — has 010 been edited?';
  end if;

  body := replace(
    body,
    $old$raise exception 'That duty no longer exists.' using errcode = 'P0002';$old$,
    $new$-- `for update` is RLS-filtered, so "not found" means either that there
    -- is no such duty OR that this account may not write to it. Only an
    -- unfiltered read tells those apart, and the person holding the phone
    -- needs different advice in each case.
    declare
      actual text := duty_state_unfiltered(p_duty_id);
    begin
      if actual is null then
        raise exception 'That duty no longer exists.' using errcode = 'P0002';
      elsif actual = 'submitted' then
        raise exception 'This checkpoint has already been submitted. A coordinator, the MOD or the Principal''s office can still correct it.'
          using errcode = '42501';
      else
        raise exception 'Your account cannot mark this checkpoint. Ask a coordinator to reassign it to you.'
          using errcode = '42501';
      end if;
    end;$new$
  );

  execute format(
    'create or replace function submit_duty(p_duty_id text, p_marks jsonb)
       returns table (marked int, changed int, absent int)
       language plpgsql
       security invoker
       set search_path = public
       as %L',
    body
  );
end
$$;

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- With a CLASS TEACHER's token, against their own already-submitted duty:
--   select * from submit_duty('<their duty>', '[]'::jsonb);
--   -> "This checkpoint has already been submitted. A coordinator, the MOD …"
--   NOT "That duty no longer exists."
--
-- With the same token against a genuinely absent id:
--   select * from submit_duty('no-such-duty', '[]'::jsonb);
--   -> "That duty no longer exists."
--
-- errcode 42501 is what `describeError` in src/lib/errors.js already classifies
-- as a permission problem, so the app shows the message above rather than a
-- raw Postgres string.
