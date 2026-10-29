-- 037 — Any teacher can add a student to the register.
--
-- A child who arrives mid-term is first seen by the teacher whose class they
-- walk into, often at Mangalarati or a meal, long before anybody at a desk
-- hears about them. Until now only coordinator/admin could write `students`,
-- so that child was on nobody's list — and a child on nobody's list is the one
-- the safety alert can never fire for. The teacher can now add them on the
-- spot; every addition is in the activity log under their name (008's
-- `students_log_changes` trigger), so the office can check it the same day.
--
-- WHAT A TEACHER CAN AND CANNOT DO
--  * add a student into a class that already exists — yes
--  * start a new class (a grade/section with no students) — no; that changes
--    the shape of the roster and is coordinator/admin, as before
--  * edit or deactivate an existing student — no; unchanged (002's policies)
-- Nurse and reception cannot add: they do not file class registers.
--
-- Written through an RPC, not a new INSERT policy, so the "existing class
-- only" rule and the validation live in one place that the client cannot
-- talk its way round.

begin;

create or replace function add_student(
  p_admission text,
  p_name      text,
  p_grade     int,
  p_section   text,
  p_stype     text,
  p_house     text default null,
  p_roll      int  default null
) returns students
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := coalesce(my_role(), '');
  v_adm     text := upper(trim(coalesce(p_admission, '')));
  v_name    text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_section text := upper(trim(coalesce(p_section, '')));
  v_house   text := nullif(trim(coalesce(p_house, '')), '');
  v_exists  boolean;
  v_roll    int;
  v_row     students;
begin
  if v_role not in ('teacher', 'coordinator', 'management', 'admin') then
    raise exception 'Your account cannot add students' using errcode = '42501';
  end if;
  if v_adm !~ '^[A-Z0-9/-]{3,20}$' then
    raise exception 'Enter the admission number from the school register (3–20 letters or digits)'
      using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Enter the student''s full name' using errcode = '22023';
  end if;
  if p_grade is null or p_grade < 1 or p_grade > 12 then
    raise exception 'Choose a grade from 1 to 12' using errcode = '22023';
  end if;
  if v_section = '' then
    raise exception 'Choose the section' using errcode = '22023';
  end if;
  if coalesce(p_stype, '') not in ('Residential', 'Day Scholar', 'Vedic School', 'Day Boarding') then
    raise exception 'Choose residential or day scholar' using errcode = '22023';
  end if;
  if v_house is not null and not exists (select 1 from houses where name = v_house) then
    raise exception 'There is no house called %', v_house using errcode = '22023';
  end if;
  if p_roll is not null and (p_roll < 1 or p_roll > 999) then
    raise exception 'Roll number must be between 1 and 999' using errcode = '22023';
  end if;

  -- Checked against inactive rows too: an admission number belongs to one
  -- child for ever, and re-using a leaver's number would hang their history
  -- on somebody else.
  if exists (select 1 from students where upper(admission_no) = v_adm) then
    raise exception 'Admission number % is already on the register', v_adm using errcode = '23505';
  end if;

  select exists (
    select 1 from students where active and grade = p_grade and upper(section) = v_section
  ) into v_exists;
  if not v_exists and v_role not in ('coordinator', 'admin') then
    raise exception 'Class % % has no students yet. Ask a coordinator to start a new class.',
      p_grade, initcap(lower(v_section)) using errcode = '42501';
  end if;

  -- Keep the section's spelling as the register already has it ('KRISHNA',
  -- 'A', 'Vedic'), so the class key the duties use matches exactly.
  select section into v_section from students
   where active and grade = p_grade and upper(section) = v_section
   limit 1;
  v_section := coalesce(v_section, upper(trim(p_section)));

  v_roll := coalesce(p_roll, (select coalesce(max(roll_no), 0) + 1 from students
                               where active and grade = p_grade and section = v_section));

  insert into students (admission_no, name, grade, section, stype, roll_no, house, active)
  values (v_adm, v_name, p_grade, v_section, p_stype, v_roll, v_house, true)
  returning * into v_row;

  -- A brand-new class needs its own Morning attendance register today.
  if not v_exists then
    perform generate_duties(school_today());
    perform generate_duties(school_today() + 1);
  end if;

  return v_row;
end $$;

revoke all on function add_student(text, text, int, text, text, text, int) from public, anon;
grant execute on function add_student(text, text, int, text, text, text, int) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- (tests/coordinator-rls.test.cjs covers these against the mock project.)
--   teacher  add_student into an existing class          -> row; activity log names the teacher
--   teacher  add_student into a class with no students   -> 42501
--   teacher  add_student with an admission no. in use    -> 23505
--   nurse    add_student                                 -> 42501
--   teacher  insert into students directly               -> rejected (002 policy unchanged)
