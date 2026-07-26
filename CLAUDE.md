@AGENTS.md

# Gurukul — Attendance & Student Safety App

Read this whole file before writing any code. It is the single source of truth for
what to build, what already exists, and what every screen/table/function must be
named. Full background documents are in `docs/reference/` if you need more depth
than what's condensed here.

## 1. What this app is

Bhaktivedanta Gurukula (a residential + day school, ~415 students, Grades 2–12)
takes attendance 8–10 times a day at named "checkpoints" (Mangalarati, Breakfast,
Morning attendance, Lunch, Sports, Evening study, Dinner, Night attendance). Right
now it's done on paper. This app digitizes it:

- A teacher opens the app, sees only their own duties for today, and marks a class
  in under 2 minutes (everyone defaults to Present — they only touch exceptions).
- The moment a submission happens, a summary goes out automatically, and the system
  checks: **was this student marked present at an earlier checkpoint today and is
  now absent?** If yes, that's an immediate safety alert to the Coordinator, MOD,
  and Principal. This single check is the actual reason the app exists — treat it
  as non-negotiable, not a nice-to-have.
- Missed checkpoints escalate automatically (teacher reminded → coordinator
  notified → principal notified).

A second module (Progress Tracker — academic/hostel learning-outcome tracking) and
a set of extensions (gate pass, sick bay, emergency muster, kitchen headcount) are
**explicitly out of scope for now**. Don't build them. They're documented in
`docs/reference/combined-platform-requirements.md` for later.

## 2. Current state of this repo — read before touching anything

This repo already has a working **Expo (React Native + react-native-web) scaffold**
with role-based navigation and mock data. This is further along than a fresh
project — build on it, don't replace it.

| Already built | File |
|---|---|
| Login (fake — just picks a staff profile) | `src/screens/LoginScreen.js` |
| Duties list ("My Duties" / "Today's Duties") | `src/screens/DutiesScreen.js` |
| Mark-attendance screen | `src/screens/DutyMarkingScreen.js` |
| Overview + live alerts feed | `src/screens/DashboardScreen.js` |
| Duty roster (thin) | `src/screens/RosterScreen.js` |
| Profile / logout | `src/screens/AccountScreen.js` |
| Role → which tabs render | `src/navigation/RootNavigator.js` |
| Fake session state | `src/context/AuthContext.js` |
| In-memory attendance records | `src/context/AttendanceContext.js` |
| Hardcoded students/duties/alerts | `src/data/mockData.js` |
| Colors, spacing, type scale | `src/theme/theme.js` |
| Card/Pill/IconCircle building blocks | `src/components/ui.js` |

**Everything above is mock data and in-memory state — there is no backend yet.**
`AttendanceContext.submitDuty()` just updates local React state; nothing is saved
anywhere real, no email goes out, no safety check runs. That's the entire job of
Section 5 below.

Note the stack diverged from an earlier plan (a Vite web PWA) to Expo instead —
that's fine and already decided by the existing scaffold. Don't switch it back.
Supabase as the backend is unaffected by this choice — Expo talks to Supabase the
same way a web app would.

## 3. Naming already established in the code — use these exact identifiers

Do not invent new names for things that already have one. Extend these, don't
duplicate them under a different name.

| Concept | Exact name in code | Notes |
|---|---|---|
| Student record | `STUDENTS` (mock) → will become Supabase `students` table | field `adm` = admission number, `key` = `"{grade}\|{section}"`, `label` = e.g. `"4 A"` |
| A checkpoint+group+staff for one day | `DUTIES` (mock) → Supabase `duties` table | fields: `id`, `checkpoint`, `group`, `start`, `end`, `staffId` |
| Computed duty progress (not stored) | `dutyStatus(duty, records)` → returns `"upcoming" \| "due" \| "overdue" \| "done"` | UI label mapping: `STATUS_LABEL` in `DutiesScreen.js` (Upcoming / Due now / Overdue / Submitted) |
| One student's mark | `records[dutyId].statuses[studentId]` (mock) → Supabase `attendance` table | |
| Present/Absent/Home/etc. codes | `STATUS_META` = `{ A, H, S, V, O, G, Y }` | Present has no code — it's the default/absence-of-an-entry |
| Statuses that carry to later checkpoints | `SPANNING` = `["H","S","O","G"]` | matches `spanning_statuses` table in the schema |
| Logged-in person | `useAuth().user` → `{ id, name, role, email, ... }` | `role` is one of `teacher \| coordinator \| management \| admin \| nurse` |
| Attendance state/actions | `useAttendance()` → `{ records, submitDuty }` | `submitDuty(dutyId, statuses, markedBy)` — this is the function to make real |
| Safety flags | `ALERTS` (mock) → Supabase `alerts` table | kinds used so far: `OK`, `ALERT`, `OVERDUE` |
| Get a duty's student list | `studentsForDuty(duty)` | keep this helper, back it with a real query later |

## 4. Roles and navigation (already wired — don't restructure without reason)

`RootNavigator.js` already renders different tabs per role:

- **teacher** → Duties, Account
- **coordinator** → Duties, Roster, Dashboard, Account
- **management** → Dashboard, Account
- **admin** → Dashboard, Roster, Account
- **nurse** → Dashboard, Account (nurse-specific screens are out of scope for now — sick bay is a later module)

This is a finer-grained version of the earlier "3 main options" idea (Mark
Attendance / Roster & People / Reports & Alerts) — **Duties = Mark Attendance**,
**Roster = Roster & People**, **Dashboard = Reports & Alerts**. Keep using the
existing screen names above; don't rename them to match that 3-option phrasing.

## 5. What's actually left to build — in order

### 5.1 Backend accounts (nothing coded yet)
- [ ] Supabase project (region: Mumbai) — Postgres + Auth + Row-Level Security + Edge Functions + cron, all in one
- [ ] Brevo or Resend account (email API) — one verified sender address
- [ ] Vercel (if/when a web build is deployed via `expo start --web` / `expo export`)

### 5.2 Database schema
Full SQL is already written in `docs/reference/self-build-guide.md` §3 — run it as
migration 001, don't redesign it. Minimum tables for this build:

```
students          — admission_no (PK), name, grade, section, stype, house, roll_no, active, ...
staff             — id, auth_user_id, name, role, phone, email, active
checkpoints       — id, name, start_min, end_min, days, mandatory_escalation, ...
duty_defaults     — recurring roster (checkpoint + group + staff)
duties            — one row per group per checkpoint per DAY, generated from duty_defaults nightly
attendance        — one row per (duty_id, admission_no): status, from_spanning, ...
status_types      — configurable entry types (P, A, H, S, V, O, G, Y + custom)
spanning_statuses — Home/Sick/Outing that pre-fills every later checkpoint until cleared
alerts            — kind, admission_no, duty_id, detail, closed_at, closed_by, close_remark
audit_log         — every admin action, automatically
```
Create the Module F tables too (`gate_passes`, `sickbay_admissions`) even though
they're unused this sprint — avoids a schema rework later.

**Row-Level Security is not optional.** Turn it on for every table from the start:
a teacher's login must be unable to query another class's data even directly from
the network console. Test this by hand before real student data goes in.

### 5.3 Import the real student data
`docs/data/students_415.csv` has the actual 415-student register (extracted from
the original web prototype's data — same students, same admission numbers). Column
names already match the school's own Excel register format. Write a one-time,
re-runnable import script (skip rows whose `admission_no` already exists).

### 5.4 Wire `submitDuty` to Supabase
Replace `AttendanceContext`'s in-memory `submitDuty` with a real call to a Postgres
function `submit_duty(duty_id, rows jsonb)` that saves every student's mark and
locks the duty in one atomic step. Once submitted, `DutyMarkingScreen` should
re-render read-only (this pattern doesn't exist yet — add it).

### 5.5 The safety alert (build this right after 5.4 — it's the priority)
Right after a submission, run a check (Supabase Edge Function `send-summary`):
for every student marked Absent just now, was there an earlier submitted duty
today where they were Present/accounted? If yes → insert into `alerts` with
kind `present_then_absent` and email Coordinator + MOD + Principal immediately
with name, class, house, and last-seen checkpoint. Alerts only close when a
Coordinator provides a written remark — never auto-resolved.

Also in `send-summary`: after every submission, email Coordinator + MOD +
Principal a plain-text summary, e.g. `"Breakfast Senior 138/149 present · 2
ABSENT"`.

### 5.6 Reminders & escalation
Edge Function `cron-reminders`, running every 5 minutes, 4:00 AM–10:30 PM:
- 10 min before a duty's window closes, still unmarked → email the assigned staff
- At window close, still unmarked → email Coordinator + MOD
- 10 min after that → email the Principal
- Checkpoints flagged `mandatory_escalation` (meal + night checkpoints) skip
  straight to the Principal on miss

A companion nightly Edge Function `cron-generate-duties` (runs ~00:05) copies
`duty_defaults` into actual `duties` rows for the day — this is what populates
`DutiesScreen`'s list once real data replaces the mock `DUTIES` array.

### 5.7 Flesh out Roster and Dashboard with real data
- `RosterScreen` (currently 41 lines, thin): add reassign-duty (writes
  `duties.staff_id`, one-day override) and basic student/staff add & deactivate
  (deactivate = flag + leaving date, never delete).
- `DashboardScreen`: swap `ALERTS`/`DUTIES` mock arrays for live Supabase queries;
  add a "close alert with remark" action.

### 5.8 Security pass
Log in as an actual teacher account, try to query another class's data directly.
Confirm RLS blocks it. Repeat for each role before the pilot.

### 5.9 Pilot
2 real class-sections + 1 meal band, marking digitally for one week, paper still
running in parallel. Fix friction daily.

**If time runs short: 5.1–5.6 must be solid — that's the whole safety-net purpose
of the app. 5.7 can ship thinner (just reassign + add/deactivate) without breaking
the pilot.**

## 6. Reference material in this repo

- `docs/reference/self-build-guide.md` — full database schema (SQL), Edge Function
  logic in more detail, milestone plan
- `docs/reference/attendance-requirements.md` — the original requirements doc,
  plain-text extract (full status-type table, checkpoint list, all acceptance
  criteria)
- `docs/reference/combined-platform-requirements.md` — the merged spec including
  the Progress Tracker module (out of scope now, but read Section 9 for the open
  decisions the school still needs to answer)
- `docs/reference/developer-briefing-slides.md` — plain-text extract of the
  slide-deck summary
- `docs/reference/original-web-prototype.jsx` — the original React (web) prototype
  this Expo app's mock data was ported from
- `docs/data/students_415.csv` — the real 415-student register for the import step
- `docs/dev-tracker.html` — an open-in-browser checklist tracking this same build
  order with checkboxes that persist locally

## 7. Open questions (not yours to decide — flag them, don't guess)

- Who may set a spanning status (Home/Sick/Outing) — Coordinator only, or also
  the nurse for Sick?
- Are Vedic School students residential for prasadam/night checkpoints? (assumed
  yes for now)
- WhatsApp vs SMS vs email-only as the primary notification channel (this build
  uses email/Brevo per the self-build-guide; WhatsApp is deferred)
- Final Saturday/Sunday checkpoint schedule

If a decision here would change what you're about to build, stop and surface the
question instead of guessing.
