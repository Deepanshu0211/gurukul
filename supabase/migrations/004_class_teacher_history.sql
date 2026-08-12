-- 004_class_teacher_history.sql
-- Lets a CLASS TEACHER read their own class's attendance across every
-- checkpoint and every past day (SRS A8), without widening what they can see
-- of any other class.
--
-- Why this is needed: 002 scoped `duties` and `attendance` SELECT to the duty's
-- own staff member. That is right for marking, but it also meant the "My Class"
-- screen returned nothing whenever another teacher had marked the checkpoint —
-- which is every checkpoint outside the teacher's own duty. The screen looked
-- broken rather than blocked.
--
-- Policies are PERMISSIVE, so these are added alongside the ones in 002 and
-- OR with them. Nothing in 002 is dropped.
--
-- TESTING (do not skip — see the header of 002):
--   1. Sign in as a class teacher. Read attendance for one of their students on
--      a duty belonging to another teacher → must SUCCEED.
--   2. Same token, read attendance for a student in a different class → must
--      return ZERO rows.
--   3. Same token, attempt an UPDATE on a submitted row → must FAIL. This
--      migration grants SELECT only.

-- The caller's class, e.g. '4|A'. Null for duty staff with no class of their
-- own, which makes every policy below fall through to false for them.
-- SECURITY DEFINER so it can read `staff` without recursing through the very
-- policies that call it — same pattern as my_role() in 002.
create or replace function my_class_key() returns text
language sql stable security definer set search_path = public
as $$ select class_key from staff where auth_user_id = auth.uid() $$;

-- ── DUTIES ──────────────────────────────────────────────────────────────────
-- A class teacher may see a duty that could contain their students: either it
-- targets their class explicitly, or it is a band/school-wide duty (class_key
-- null). A duty pinned to a DIFFERENT class can never contain their students,
-- so it stays hidden.
drop policy if exists duties_select_class_teacher on duties;

create policy duties_select_class_teacher on duties
  for select to authenticated
  using (
    my_class_key() is not null
    and (class_key is null or class_key = my_class_key())
  );

-- ── ATTENDANCE ──────────────────────────────────────────────────────────────
-- Exact rather than duty-shaped: the teacher sees the marks of the students in
-- their own class and no one else's, whichever duty recorded them. A band-wide
-- duty covering three classes therefore exposes only their third of it.
drop policy if exists attendance_select_class_teacher on attendance;

create policy attendance_select_class_teacher on attendance
  for select to authenticated
  using (
    my_class_key() is not null
    and exists (
      select 1 from students s
      where s.admission_no = attendance.admission_no
        and s.grade || '|' || s.section = my_class_key()
    )
  );

-- Supports the EXISTS above; without it every attendance row read costs a
-- lookup on the students primary key one row at a time.
create index if not exists students_class_key_idx
  on students ((grade || '|' || section));
