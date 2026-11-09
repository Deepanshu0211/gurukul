-- 042 — An optional remark on a submitted register.
--
-- The school asked for a box at the final submit step where the teacher can
-- write a note (e.g. "3 children left early for the Vrindavan bus"). It lives
-- on the duty, so every screen that reads `duties` gets it with no extra query.
--
-- Written only through `set_duty_remark`, never by a table UPDATE: the caller
-- must be the person who submitted the register, or an overseer who may
-- correct it (`can_override`, 006). Re-runnable.

alter table public.duties add column if not exists remark text;

create or replace function public.set_duty_remark(p_duty_id text, p_remark text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d duties;
begin
  select * into d from duties where id = p_duty_id;
  if d.id is null then
    raise exception 'No such register.' using errcode = 'P0002';
  end if;
  if d.state <> 'submitted' then
    raise exception 'Submit the register before adding a remark.' using errcode = '22023';
  end if;
  if not (d.submitted_by = my_staff_id() or can_override()) then
    raise exception 'Only the person who submitted this register can add its remark.'
      using errcode = '42501';
  end if;

  update duties
     set remark = nullif(left(trim(coalesce(p_remark, '')), 500), '')
   where id = p_duty_id;
end;
$$;

revoke all on function public.set_duty_remark(text, text) from public, anon;
grant execute on function public.set_duty_remark(text, text) to authenticated;

-- ── VERIFY (teacher login) ──────────────────────────────────────────────────
--   select set_duty_remark('<a duty you submitted>', 'test');   -- ok
--   select remark from duties where id = '<that duty>';         -- 'test'
--   select set_duty_remark('<someone else''s duty>', 'x');      -- 42501
