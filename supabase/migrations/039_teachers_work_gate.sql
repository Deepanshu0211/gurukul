-- 039 — Teachers can sign students out at the gate and back in.
--
-- 034 limited the gate to reception, coordinator and admin. The school asked
-- for teachers to have the same power: a teacher is often the one handing a
-- child to family, and the desk is not always staffed. Management, nurse and
-- anyone without a staff row stay excluded.
--
-- Only the role guard changes. Both functions are otherwise copied unchanged
-- from 034, so a leave is still written only through these two RPCs and still
-- records who signed the child out and back in. Re-runnable.

create or replace function sign_student_out(
  p_adm      text,
  p_status   text default 'H',
  p_reason   text default null,
  p_expected date default null
)
returns student_leave
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := my_staff_id();
  r    student_leave;
  name text;
begin
  -- `coalesce`, not `my_role() not in (…)`: a caller with no staff row makes
  -- `my_role()` NULL and `NULL not in (…)` would wave them through.
  if coalesce(my_role(), '') not in ('reception','coordinator','admin','teacher') then
    raise exception 'Only reception, a teacher, a coordinator or an administrator can sign a student out.'
      using errcode = '42501';
  end if;

  select students.name into name from students
   where admission_no = p_adm and active;
  if name is null then
    raise exception 'No active student with admission number %.', p_adm
      using errcode = 'P0002';
  end if;

  if not exists (select 1 from status_types where code = p_status and spanning) then
    raise exception '% is not a status a student can be signed out under.', p_status
      using errcode = '22023';
  end if;

  if exists (select 1 from student_leave where admission_no = p_adm and in_at is null) then
    raise exception '% is already signed out. Sign them back in first.', name
      using errcode = '23505';
  end if;

  insert into student_leave (admission_no, status, reason, out_by, expected_back)
  values (p_adm, p_status, nullif(trim(coalesce(p_reason, '')), ''), me, p_expected)
  returning * into r;

  return r;
end;
$$;

create or replace function sign_student_in(p_adm text)
returns student_leave
language plpgsql
security definer
set search_path = public
as $$
declare
  me   text := my_staff_id();
  r    student_leave;
  name text;
begin
  if coalesce(my_role(), '') not in ('reception','coordinator','admin','teacher') then
    raise exception 'Only reception, a teacher, a coordinator or an administrator can sign a student back in.'
      using errcode = '42501';
  end if;

  select students.name into name from students where admission_no = p_adm;

  update student_leave
     set in_at    = now(),
         back_day = school_today(),
         in_by    = me
   where admission_no = p_adm and in_at is null
   returning * into r;

  if r.id is null then
    raise exception '% is not signed out.', coalesce(name, p_adm)
      using errcode = 'P0002';
  end if;

  return r;
end;
$$;

revoke all on function sign_student_out(text, text, text, date) from public;
revoke all on function sign_student_in(text) from public;
grant execute on function sign_student_out(text, text, text, date) to authenticated;
grant execute on function sign_student_in(text) to authenticated;

-- ── VERIFY (as a teacher login) ─────────────────────────────────────────────
--   select sign_student_out('<adm>', 'H', 'test', null);   -- succeeds
--   select sign_student_in('<adm>');                       -- succeeds
-- As a management or nurse login, both must still fail with 42501.
