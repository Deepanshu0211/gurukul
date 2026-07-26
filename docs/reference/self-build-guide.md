# Self-Build Implementation Guide
## Attendance & Student Safety System — Bhaktivedanta Gurukula
### Stack: Supabase + React PWA + Email notifications · v1.0

This guide turns the requirements document (SRS v1.1) into a concrete build plan you can
execute yourself, ideally with Claude Code doing the coding while you steer. WhatsApp is
deferred; all notifications go by email. Read it once fully, then work milestone by milestone.

---

## 1. The stack and why

| Layer | Choice | Why |
|---|---|---|
| Database, logins, access control, scheduled jobs | **Supabase** (free tier for pilot) | Postgres + Auth + Row-Level Security + Edge Functions + cron in one service; nothing to host yourself |
| Teacher/admin/management app | **React + Vite, built as a PWA** | Your prototype is already React; PWA = installs to home screen like an app, no Play Store |
| Hosting | **Vercel** (free) | Push to GitHub → auto-deploys; HTTPS included |
| Email | **Brevo** (300/day free) or **Resend** (100/day free) | Simple HTTP API callable from Supabase Edge Functions |
| Code + backup of code | **GitHub private repo** | Version history; also runs the nightly DB backup action |

Estimated daily email volume: ~16 duty summaries + ~5 reminders/escalations + digests ≈ 30–50/day.
Brevo's 300/day free tier is comfortable.

**Deliberately deferred (add later, in this order):** WhatsApp, offline marking, native Android app,
Module F. The schema below already includes Module F tables so nothing needs rework.

---

## 2. Project structure

```
gurukula-attendance/
├── app/                      # React PWA (Vite)
│   ├── src/
│   │   ├── screens/          # Teacher, Roster, Management, Admin — port from prototype
│   │   ├── lib/supabase.js   # client + auth helpers
│   │   └── main.jsx
│   ├── public/manifest.json  # PWA manifest + icons
│   └── vite.config.js        # vite-plugin-pwa
├── supabase/
│   ├── migrations/           # every schema change as a numbered .sql file
│   └── functions/            # Edge Functions (Deno):
│       ├── send-summary/     #   called after each submission
│       ├── cron-reminders/   #   every 5 min: reminders + escalations
│       ├── cron-generate-duties/  # nightly: create today's duties from defaults
│       └── cron-night-reconciliation/
├── scripts/
│   └── import_students.py    # one-time import from Student_List_2025-26.xlsx
└── .github/workflows/backup.yml  # nightly pg_dump to private repo/storage
```

---

## 3. Database schema (run as migration 001)

```sql
-- ENUMS ----------------------------------------------------------------
create type student_type as enum ('RESIDENTIAL','DAY_SCHOLAR','VEDIC_SCHOOL','DAY_BOARDING');
-- Entry types are DATA, not an enum, so the school can disable optional ones
-- and add custom types (SRS S7) without a code change:
create table status_types (
  code text primary key,           -- 'P','A','H','S','V','O','Y','G', customs...
  label text not null,             -- Present, Absent, Home, Sick, Activity, Outing,
                                   -- Self study, Gita Nagari
  accounted boolean not null,      -- false only for 'A'
  spanning boolean not null default false,   -- true for H, S, O, G
  enabled boolean not null default true,
  fixed boolean not null default false       -- 'P' and 'A' cannot be disabled
);
create type user_role   as enum ('teacher','coordinator','management','admin','nurse');
create type duty_state  as enum ('pending','submitted');

-- PEOPLE ---------------------------------------------------------------
create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users unique,      -- link to Supabase login
  name text not null,
  role user_role not null default 'teacher',
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table students (
  admission_no text primary key,                       -- e.g. S2401021
  name text not null,
  grade int not null check (grade between 1 and 12),
  section text not null,                               -- A / KRISHNA / BALRAM / Vedic
  stype student_type not null,
  house text default 'Assign',
  roll_no int,
  year_of_joining int,
  old_new text,
  remedial boolean not null default false,
  active boolean not null default true,
  joining_date date,
  leaving_date date,                                   -- set on deactivation, never delete
  created_at timestamptz default now()
);
create index on students (grade, section) where active;

-- CHECKPOINT CONFIG ----------------------------------------------------
create table checkpoints (
  id text primary key,                                 -- 'mangalarati', 'morning', ...
  name text not null,
  start_min int not null,                              -- minutes from midnight
  end_min int not null,
  days text not null default 'MTWTF--',                -- weekday mask; separate rows for Sat/Sun
  res_only boolean not null default false,
  mandatory_escalation boolean not null default false, -- SRS C2
  reminder_lead_min int not null default 10,
  active boolean not null default true
);

-- group definition stored as jsonb, e.g.
--  {"kind":"section","grade":7,"section":"KRISHNA"}
--  {"kind":"band","min":2,"max":5,"res_only":true}
--  {"kind":"remedial"}   {"kind":"res_all"}
create table duty_defaults (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id text references checkpoints not null,
  grp jsonb not null,
  staff_id uuid references staff not null,
  active boolean not null default true
);

create table duties (                                  -- one row per group per checkpoint per DAY
  id uuid primary key default gen_random_uuid(),
  day date not null,
  checkpoint_id text references checkpoints not null,
  grp jsonb not null,
  staff_id uuid references staff not null,             -- reassignable = one-day override
  state duty_state not null default 'pending',
  submitted_by uuid references staff,
  submitted_at timestamptz,
  reminder_sent boolean default false,
  escalated_l1 boolean default false,                  -- coordinator/MOD
  escalated_l2 boolean default false,                  -- principal
  unique (day, checkpoint_id, grp)
);

-- ATTENDANCE -----------------------------------------------------------
create table attendance (
  duty_id uuid references duties not null,
  admission_no text references students not null,
  status text not null references status_types,
  from_spanning boolean not null default false,        -- prefilled, teacher didn't touch
  primary key (duty_id, admission_no)
);
-- Store EVERY student of the group incl. Present rows: report queries stay trivial.

create table spanning_statuses (
  id uuid primary key default gen_random_uuid(),
  admission_no text references students not null,
  status text not null references status_types,   -- must have spanning=true (enforce via trigger)
  set_by uuid references staff not null,
  source text not null default 'office' check (source in ('office','teacher')),
  confirmed boolean not null default true,        -- false when teacher-initiated (SRS S8)
                                                  -- until the Coordinator confirms
  starts_at timestamptz not null default now(),
  expected_end timestamptz not null,
  cleared_at timestamptz,
  cleared_by uuid references staff,
  remarks text
);
create index on spanning_statuses (admission_no) where cleared_at is null;

-- ALERTS & AUDIT -------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,          -- 'present_then_absent','overdue_duty','overdue_return','night_unverified'
  admission_no text references students,
  duty_id uuid references duties,
  detail text,
  created_at timestamptz default now(),
  closed_at timestamptz,
  closed_by uuid references staff,
  close_remark text
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz default now(),
  actor uuid,
  action text not null,        -- 'student.deactivate','roster.reassign','import', ...
  entity text,
  before jsonb,
  after jsonb
);

-- MODULE F TABLES (create now, use in M4) -------------------------------
create table gate_passes (
  id uuid primary key default gen_random_uuid(),
  admission_no text references students not null,
  kind text not null check (kind in ('outing','home')),
  destination text, accompanying_adult text,
  approved_by uuid references staff,
  expected_out timestamptz, expected_return timestamptz,
  actual_out timestamptz, actual_in timestamptz,
  pickup_ack text, spanning_id uuid references spanning_statuses
);
create table sickbay_admissions (
  id uuid primary key default gen_random_uuid(),
  admission_no text references students not null,
  admitted_at timestamptz default now(), discharged_at timestamptz,
  complaint text, vitals text, medicines text, remarks text,
  parents_informed boolean default false,
  spanning_id uuid references spanning_statuses
);
```

### Row-Level Security — the non-negotiable part

Enable RLS on every table, then (illustrative core policies):

```sql
alter table attendance enable row level security;
alter table duties enable row level security;
alter table students enable row level security;

-- helper: current staff row
create function my_staff() returns staff language sql stable as
 $$ select * from staff where auth_user_id = auth.uid() $$;

-- teachers read/write only their own duties' attendance
create policy teacher_att on attendance for all using (
  exists (select 1 from duties d where d.id = duty_id
          and (d.staff_id = (select id from my_staff())
               or (select role from my_staff()) in ('coordinator','management','admin')))
);
-- teachers see students (needed to render lists) but only coordinators+ modify
create policy read_students  on students for select using (auth.uid() is not null);
create policy write_students on students for insert with check ((select role from my_staff()) in ('coordinator','admin'));
create policy upd_students   on students for update using ((select role from my_staff()) in ('coordinator','admin'));
-- attendance rows immutable once duty submitted (teacher side)
create policy lock_after_submit on attendance for update using (
  (select role from my_staff()) in ('coordinator','admin')
  or exists (select 1 from duties d where d.id = duty_id and d.state = 'pending')
);
```

**Test RLS by hand**: log in as a teacher account and confirm you cannot select another
class's attendance from the browser console. Do this before the pilot, not after.

---

## 4. Core logic (where it lives)

**Daily duty generation** — `cron-generate-duties`, scheduled 00:05 IST daily:
copy `duty_defaults` matching today's weekday mask into `duties` for today.
The Coordinator's roster screen edits `duties.staff_id` (a one-day override) — defaults stay untouched.

**Marking screen load** — the client fetches the duty, resolves the group to active students
(SQL mirrors the prototype's `popStudents`), then fetches open `spanning_statuses` for those
students and pre-fills spanning-type entries (H/S/O/G and any custom spanning types) with `from_spanning = true`.

**Submission** — insert all attendance rows + set the duty `submitted` in one RPC
(`submit_duty(duty_id, rows jsonb)`, a Postgres function, so it is atomic), then invoke the
`send-summary` Edge Function, which:
1. Computes Present / accounted / absent with the Res–Day split (same as the prototype's `summarize`).
2. Emails Coordinator + MOD + Principal (recipients configurable in a small table).
3. Runs the **safety check** (F1): for each 'A' row, look for an earlier submitted duty today
   covering that student where status = 'P' → insert an `alerts` row + immediate email.
4. If a teacher submits Present for a student with an open spanning status → email the
   coordinator to review/clear it (SRS S3).
5. If a teacher marks a spanning-capable entry (Home/Sick/Outing/Gita Nagari) for a student
   with NO open spanning status → auto-create a provisional row
   (`source='teacher', confirmed=false`, expected_end = end of day until confirmed) so it
   pre-fills every later checkpoint, and email the Coordinator to confirm the expected
   return or correct it (SRS S8). Render provisional prefills with a "to be confirmed" flag.

**Reminders & escalation** — `cron-reminders` every 5 minutes during 04:00–22:30 IST:
```
for each of today's duties still 'pending':
  now >= end - reminder_lead  and !reminder_sent -> email assigned teacher; set flag
  now >= end                  and !escalated_l1  -> email Coordinator+MOD (or Principal
                                                    immediately if mandatory_escalation); flag
  now >= end + 10 min         and !escalated_l2  -> email Principal; flag
```

**Night reconciliation** — cron after the night window: list active residential students with
no P/accounted row in any submitted night duty → email + `alerts(kind='night_unverified')`;
the management screen requires a coordinator/principal to close it with a remark (F3, F4).

**Reports (M3)** — SQL views: per-student per-checkpoint-type percentages over a date range
(R2); a Monday cron for the needs-attention list (R3). Excel export of the daily proforma:
generate with `exceljs` in an Edge Function, or simpler — a printable HTML report page
matching the proforma plus a CSV download, upgrading to true .xlsx later.

**Email subjects** — plain and scannable so the Principal can triage from a lock screen:
```
[OK] Breakfast Senior 138/149 · 2 ABSENT
[ALERT] R. Sharma (7 K) present at mangalarati, ABSENT at breakfast
[OVERDUE] Morning attendance 9 B not submitted (Ajay Solanki Pr)
```

---

## 5. Milestone plan (each ≈ one focused weekend + weekday evenings)

**M0 — Foundations (1 evening)**
GitHub repo · Supabase project (region: Mumbai) · run migration 001 · Brevo/Resend account,
verify a sender such as alerts@yourschooldomain · Vercel account.

**M1a — Data + auth**
`import_students.py` (pandas → students table; re-runnable, skips existing admission numbers) ·
insert checkpoints + staff · create logins for 5 pilot users and link `staff.auth_user_id` ·
login screen; the role on the staff row decides which screens render.

**M1b — Marking + summary email**
Port the prototype marking screen to live data (status enum, spanning prefill, exception marking) ·
`submit_duty` RPC · `send-summary` function with the safety check · teacher "my duties today"
and read-only cross-check views.
*Acceptance:* mark a real class on a phone in under 2 minutes; the summary email arrives within
1 minute; a planted present-then-absent case produces the ALERT email.

**M1c — PILOT** · 2 class-sections + 1 prasadam band, one week, in parallel with paper.
Fix friction daily. Do not proceed until teachers stop needing to ask you questions.

**M2 — Roster + reminders + spanning UI**
Roster screen (reassign, weekly-defaults editor) · `cron-generate-duties` + `cron-reminders` ·
coordinator screen to set/clear spanning statuses with an expected end · night reconciliation
cron + acknowledgment screen · management dashboard (port from the prototype, now live).

**M3 — Admin + reports + hardening**
Admin screens: add/deactivate students & staff, CSV/Excel import with validation preview
(port from the prototype — it already implements the rules) · audit-log writes on all admin
actions · reports R1–R4 · nightly `pg_dump` GitHub Action + one restore test · RLS
self-penetration test · upgrade Supabase to Pro ($25/mo) before whole-school rollout
(automated backups) · onboard all staff.

**M4 — Module F** — only after a full term of stable daily use; the tables already exist.

---

## 6. Runbook (write it, keep it printed)

- URLs + where credentials live (use a password manager; never in code).
- "Email didn't arrive" → check the Brevo dashboard → check Edge Function logs.
- "Teacher can't log in" → reset flow. "Wrong marking" → coordinator correction (audit-logged).
- Power/network down → printed blank register (one-click print page), back-enter later.
- Restore procedure from the nightly dump — tested, with the date you last tested it.
- Second person who has read this runbook: ____________

---

## 7. Working with Claude Code — first prompts

1. "Read the requirements docx sections 4–5 and this guide's schema; create Supabase
   migration 001 and explain any deviation you make."
2. "Port the marking screen from gurukula-attendance-prototype.jsx to src/screens/Marking.jsx
   using live Supabase data, including spanning-status prefill."
3. "Write the submit_duty Postgres function and the send-summary Edge Function per guide §4,
   emailing via Brevo; include the F1 safety check."
4. "Write cron-reminders per guide §4 and a test that simulates a missed checkpoint."

Keep each session scoped to one milestone task; commit after every working step.
