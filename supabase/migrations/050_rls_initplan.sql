-- 050: row-level security checks run once per query, not once per row.
--
-- THE PROBLEM
-- Policies were written `my_staff_id() IS NOT NULL`. Postgres treats a bare
-- function call in a policy as something to evaluate for EVERY row, so reading
-- the 415-student register ran 415 lookups of `staff` by `auth_user_id`, a
-- column with no index. Since October that made the two most-called reads in
-- the app (the register and a duty's marks) the two most expensive things the
-- database did: 9,466 + 2,728 calls, ~350 s of database time.
--
-- THE FIX (Supabase's own recommendation)
--   * `(select my_staff_id())` instead of `my_staff_id()`. Wrapped in a scalar
--     subquery, a STABLE function with no row arguments is evaluated ONCE per
--     statement (an InitPlan). Same value, same result, same security.
--   * An index on staff(auth_user_id), which every one of these functions
--     filters by.
--
-- Measured on the pilot as the coordinator, before -> after:
--   register 11.7 -> 0.3 ms, a day's marks 6.8 -> 0.5 ms,
--   attendance_detail 28.5 -> 2.2 ms.
--
-- WHAT DOES NOT CHANGE
-- Who can read or write what. Every policy keeps its exact expression; only
-- the evaluation strategy of these zero-argument helpers changes. Verified by
-- comparing the rows visible to every role before and after.
--
-- Re-runnable: a call that is already wrapped is left alone.

begin;

create index if not exists staff_auth_user_idx on staff (auth_user_id) where active;

do $$
declare
  p record;
  -- Zero-argument helpers only: their value cannot depend on the row.
  fn constant text := '(my_staff_id|my_role|my_class_key|can_override|is_roster_desk|receives_notifications)';
  -- A call not already inside "SELECT fn()": Postgres deparses a wrapped call
  -- as "( SELECT fn() AS fn)", so this is what makes the rewrite idempotent.
  pat constant text := '(?<!SELECT )\m' || fn || '\(\)';
  q text;
  w text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       -- NOT staff. `staff_update_own` checks staff from inside a staff
       -- policy (role and email may not change), and with these calls wrapped
       -- Postgres reports that as infinite recursion (42P17): every staff
       -- update failed in the dry run. Twenty-six rows; the index above is
       -- all it needs.
       and tablename <> 'staff'
       and (coalesce(qual, '') ~ pat or coalesce(with_check, '') ~ pat)
  loop
    q := regexp_replace(p.qual, pat, '(select \1())', 'g');
    w := regexp_replace(p.with_check, pat, '(select \1())', 'g');
    execute format(
      'alter policy %I on public.%I %s %s',
      p.policyname, p.tablename,
      case when q is not null then 'using (' || q || ')' else '' end,
      case when w is not null then 'with check (' || w || ')' else '' end
    );
  end loop;
end $$;

commit;
