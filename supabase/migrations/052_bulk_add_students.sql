-- 052 — Adding many students at once, from a spreadsheet.
--
-- WHY
-- A class that arrives at the start of term is forty children, not one. Typing
-- forty admission forms into the single-student sheet (037) is an evening's
-- work, and an evening's work is what leads to "I'll do it tomorrow" — while
-- the children are already being counted at Mangalarati on paper only, where
-- no safety alert can fire for them.
--
-- HOW
-- `add_students(rows jsonb)` takes up to 200 students and adds each one under
-- EXACTLY the rules `add_student` enforces — same role check, same validation,
-- same "a teacher cannot start a new class" rule — because both now go
-- through one internal function, `insert_student_checked`. There is no second
-- copy of the rules to drift.
--
-- Each row is its own savepoint: one bad row is reported back with its reason
-- and the rest still go in. The app shows which rows failed and why, and the
-- teacher fixes and re-sends just those. That is the right shape for a
-- register: a typo on row 31 must not cost the other 39 children their place
-- on tonight's night attendance.
--
-- Every addition still fires 008's `students_log_changes` trigger, so each
-- child appears in the activity log under the name of whoever imported them.
--
-- ALSO
-- Roll numbers may now go up to 9999. The school's own register numbers Grade
-- 12 as 1255, 1256 … (grade × 100 + n), so 037's 1–999 limit refused the
-- school's real data the moment it was typed back in.
--
-- Duty generation for a brand-new class runs ONCE per request, after every
-- row, rather than once per new class inside the loop. A coordinator importing
-- a fresh campus would otherwise regenerate the whole day's registers dozens
-- of times in one request and run into the API's statement timeout.
--
-- Re-runnable.

begin;

-- ── The rules, in one place ─────────────────────────────────────────────────
-- Not granted to anyone: callable only from the two SECURITY DEFINER wrappers
-- below, which run as the owner. A client calling it directly gets 42501.
create or replace function insert_student_checked(
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
  -- Matched case-insensitively and stored in the houses table's own spelling,
  -- so "vrindavan" in a spreadsheet lands as "Vrindavan" on the Saturday sheet.
  if v_house is not null then
    select name into v_house from houses where lower(name) = lower(v_house);
    if v_house is null then
      raise exception 'There is no house called %', trim(p_house) using errcode = '22023';
    end if;
  end if;
  if p_roll is not null and (p_roll < 1 or p_roll > 9999) then
    raise exception 'Roll number must be between 1 and 9999' using errcode = '22023';
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

  return v_row;
end $$;

revoke all on function insert_student_checked(text, text, int, text, text, text, int) from public, anon, authenticated;

-- ── One student (037's signature, unchanged for the app) ────────────────────
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
  v_new_class boolean := not exists (
    select 1 from students
     where active and grade = p_grade and upper(section) = upper(trim(coalesce(p_section, '')))
  );
  v_row students;
begin
  v_row := insert_student_checked(p_admission, p_name, p_grade, p_section, p_stype, p_house, p_roll);

  -- A brand-new class needs its own Morning attendance register today.
  if v_new_class then
    perform generate_duties(school_today());
    perform generate_duties(school_today() + 1);
  end if;

  return v_row;
end $$;

revoke all on function add_student(text, text, int, text, text, text, int) from public, anon;
grant execute on function add_student(text, text, int, text, text, text, int) to authenticated;

-- ── Many students ───────────────────────────────────────────────────────────
-- p_rows: [{ "ref": <anything the app wants echoed back>, "admission_no",
--            "name", "grade", "section", "stype", "house", "roll_no" }, …]
--
-- Returns { "results": [{ ref, ok, admission_no, name, grade, section,
--           roll_no } | { ref, ok: false, code, message }, …],
--           "duties_error": text | null }
create or replace function add_students(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role      text := coalesce(my_role(), '');
  v_item      jsonb;
  v_row       students;
  v_out       jsonb := '[]'::jsonb;
  v_new_class boolean := false;
  v_was_there boolean;
  v_state     text;
  v_msg       text;
  v_duties    text;
  v_grade     int;
  v_roll      int;
begin
  -- Refused up front, once, rather than 200 times in the results.
  if v_role not in ('teacher', 'coordinator', 'management', 'admin') then
    raise exception 'Your account cannot add students' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Send the students as a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'At most 200 students per request' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    begin
      -- Inside the savepoint, so "4A" in the grade column is that row's
      -- failure and not the whole request's.
      v_grade := nullif(trim(v_item->>'grade'), '')::int;
      v_roll  := nullif(trim(v_item->>'roll_no'), '')::int;

      select exists (
        select 1 from students
         where active and grade = v_grade
           and upper(section) = upper(trim(coalesce(v_item->>'section', '')))
      ) into v_was_there;

      v_row := insert_student_checked(
        v_item->>'admission_no',
        v_item->>'name',
        v_grade,
        v_item->>'section',
        v_item->>'stype',
        v_item->>'house',
        v_roll
      );
      if not v_was_there then
        v_new_class := true;
      end if;

      v_out := v_out || jsonb_build_object(
        'ref', v_item->'ref',
        'ok', true,
        'admission_no', v_row.admission_no,
        'name', v_row.name,
        'grade', v_row.grade,
        'section', v_row.section,
        'roll_no', v_row.roll_no
      );
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      v_out := v_out || jsonb_build_object(
        'ref', v_item->'ref',
        'ok', false,
        'code', v_state,
        'message', case
          when v_state = '22P02' then 'Grade and roll number must be whole numbers'
          -- The primary key, when two imports race for the same number.
          when v_state = '23505' and v_msg not like 'Admission number%'
            then 'Admission number ' || upper(trim(coalesce(v_item->>'admission_no', ''))) || ' is already on the register'
          else v_msg
        end
      );
    end;
  end loop;

  -- A new class needs today's and tomorrow's registers. If building them
  -- fails, the students are still worth keeping — the nightly job builds the
  -- registers anyway — so it is reported, not rolled back.
  if v_new_class then
    begin
      perform generate_duties(school_today());
      perform generate_duties(school_today() + 1);
    exception when others then
      v_duties := sqlerrm;
    end;
  end if;

  return jsonb_build_object('results', v_out, 'duties_error', v_duties);
end $$;

revoke all on function add_students(jsonb) from public, anon;
grant execute on function add_students(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
-- (tests/bulk-add-students.test.cjs covers these against the mock project.)
--   teacher  add_students, two good rows into an existing class   -> both ok, both in the activity log under the teacher
--   teacher  add_students, one row with a used admission number   -> that row ok:false 23505, the other row ok
--   teacher  add_students, a row for a class with no students     -> that row ok:false 42501
--   teacher  add_students, grade "4A"                             -> that row ok:false, "whole numbers"
--   nurse    add_students                                         -> 42501 for the whole request
--   anyone   add_students with 201 rows                           -> 22023
--   teacher  rpc insert_student_checked directly                  -> refused (not granted)
--   teacher  add_student with roll 1256                           -> row (was refused before 052)
