-- 001_schema.sql
-- Core tables for attendance. Reconstructed from the live database so a fresh
-- project can be rebuilt from scratch.
--
-- Naming note: the database is snake_case, the app is camelCase. The
-- translation happens in src/lib/*.js, never in screens.

-- ── STATUS TYPES ────────────────────────────────────────────────────────────
-- Entry types are DATA, not an enum, so the school can disable optional ones
-- and add custom ones without a code change (SRS S7). Only 'A' is unaccounted.
create table if not exists status_types (
  code      text primary key,
  label     text not null,
  accounted boolean not null default true,
  spanning  boolean not null default false
);

-- ── PEOPLE ──────────────────────────────────────────────────────────────────
create table if not exists staff (
  id           text primary key,
  name         text not null,
  role         text not null check (role in ('teacher','coordinator','management','admin','nurse')),
  email        text unique,
  phone        text,
  photo_url    text,
  class_key    text,   -- e.g. '4|A' for a class teacher; null for duty staff
  class_label  text,   -- e.g. 'Class 4 A'
  active       boolean not null default true,
  -- Links the staff record to its Supabase Auth user. Every RLS policy in
  -- 002 keys off this, so a row without it cannot be edited by its owner.
  auth_user_id uuid references auth.users(id)
);

create table if not exists students (
  admission_no text primary key,
  name         text not null,
  grade        int  not null check (grade between 1 and 12),
  section      text not null,   -- A / KRISHNA / BALRAM / Vedic
  stype        text not null,   -- Residential / Day Scholar / Vedic School / Day Boarding
  roll_no      int,
  remedial     boolean not null default false,
  -- Students are deactivated, never deleted, so history survives (SRS D3).
  active       boolean not null default true
);

create index if not exists students_grade_section_idx
  on students (grade, section) where active;

-- ── CHECKPOINTS & DUTIES ────────────────────────────────────────────────────
create table if not exists checkpoints (
  id        text primary key,
  name      text not null,
  start_min int not null,   -- minutes from midnight
  end_min   int not null
);

-- One row per group per checkpoint per DAY. staff_id is reassignable, which
-- is how a one-day override works without touching the recurring default.
create table if not exists duties (
  id            text primary key,
  checkpoint_id text not null references checkpoints(id),
  day           date not null default current_date,
  group_label   text not null,
  class_key     text,           -- set for class-section duties
  scope         text,           -- 'res' | 'all' | null
  staff_id      text not null references staff(id),
  state         text not null default 'pending' check (state in ('pending','submitted')),
  submitted_by  text references staff(id),
  submitted_at  timestamptz
);

create index if not exists duties_day_idx on duties (day);

-- ── ATTENDANCE ──────────────────────────────────────────────────────────────
-- A row per student per duty. NULL status means Present — the default, and by
-- far the most common case, so it is not stored explicitly.
create table if not exists attendance (
  duty_id      text not null references duties(id),
  admission_no text not null references students(admission_no),
  status       text references status_types(code),
  primary key (duty_id, admission_no)
);
