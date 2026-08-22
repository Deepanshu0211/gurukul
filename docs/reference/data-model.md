# Data model

Every table, what writes to it, and who can read it. The authority is
`supabase/migrations/` — this describes what those files build, so if the two
disagree, the migrations are right and this is stale.

Nine tables. Attendance is the centre; everything else either describes who
may touch it or records what was done to it.

```
checkpoints ──┐
              ├─→ duties ──→ attendance ──→ status_types
staff ────────┘      │           │
  │                  │           └──→ students
  │                  │
  │                  ├──→ alert_resolutions
  └──────────────────┴──→ audit_log
```

---

## Reference data

### `status_types`
The vocabulary of "where was this child". Seeded, rarely changed.

| Column | Notes |
|---|---|
| `code` | PK. `A` Absent, `H` Home, `S` Sick, `O` Outing, `G` Gita Nagari, `V` Activity, `Y` Self study |
| `label` | What the app shows |
| `accounted` | False only for `A`. The school knows where every other status is |
| `spanning` | Carries forward to later checkpoints the same day (SRS S3) |

**Present has no code.** It is stored as `attendance.status IS NULL`, because
it is the overwhelming majority of rows and writing it out would double the
table for no information. Every query has to know this; `attendance_detail`
(below) spells it out so most don't have to.

### `checkpoints`
The daily schedule. `start_min` / `end_min` are **minutes from midnight**, not
times — 7:30 AM is `450`. The app compares them against `useNow()`, which
returns the same unit.

---

## People

### `staff`
| Column | Notes |
|---|---|
| `id` | PK, short text (`t1`, `c1`) — referenced by duties and audit rows |
| `email` | **Unique, and must match the Auth user exactly.** The linking step in `seed.sql` joins on it |
| `auth_user_id` | → `auth.users`. **Every RLS policy keys off this.** A staff row without it can do nothing |
| `role` | `teacher` / `coordinator` / `management` / `admin` / `nurse` |
| `class_key` | `'4|A'` for a class teacher, null for duty staff |

**Written by:** `updateOwnPhone()`, `uploadAvatar()`, and the office by hand.
**Readable by:** every signed-in user (names and roles are a directory).
**Writable:** own row only, and `role`/`email` are pinned by the policy's
`WITH CHECK` — otherwise a teacher could set `role='admin'` in the same
statement that updates their phone.

### `students`
Keyed by `admission_no`. `stype` is the readable label (`Residential`,
`Day Scholar`, …); the app translates to short codes in `lib/students.js`.
Read-only to teachers.

---

## The working set

### `duties`
One row per group, per checkpoint, per **day**.

| Column | Notes |
|---|---|
| `staff_id` | Who it is rostered to. Changing this is a reassignment — coordinator/admin only, enforced by a trigger, not by RLS |
| `submitted_by` | Who actually marked it. **Differs from `staff_id` when someone covered** — that difference is the only record of cover marking |
| `corrected_by` / `corrected_at` | Set when oversight overrules. Deliberately separate from `submitted_by`, so the original author stays on the record |
| `class_key` / `scope` | How the group resolves. `resolveGroup()` in `lib/duties.js` is the one implementation |

> **Schema gap.** `lib/duties.js` reads `r.band` and `r.mandatory_escalation`,
> but neither column exists in `001_schema.sql`. Both silently resolve to
> null/false, so band-scoped duties (`Primary` / `Middle` / `Senior`) cannot be
> expressed in the database today, and the meal-and-night escalation rule
> (SRS C2) has nothing to read. Add them in the next migration before either
> is relied on.

### `attendance`
One row per student per duty — **including present students**, written on
submission. That is what makes "was this child checked at all?" answerable,
and it is why counting rows gives a true count of children marked.

**Immutable once the duty is submitted**, except to coordinator / management /
admin, whose changes are audit-logged.

---

## The record of what happened

### `alert_resolutions`
Keyed `(duty_id, admission_no)` — the same pair the derived alert uses as its
id.

**The alert itself is not stored.** `domain/alerts.js` derives it from the
day's attendance, so it can never disagree with the marks. Only the human part
persists: who accounted for the child, and what they said.

| Column | Notes |
|---|---|
| `kind` | Snapshot of `went_missing` / `not_seen` at the time it was answered |
| `remark` | Free text, or one of `QUICK_REASONS` |
| `resolved_by` | Pinned to the caller by the policy's `WITH CHECK` |

**Writable by:** oversight, or the teacher who marked the checkpoint — they
are often the person who finds the child.

### `audit_log`
Append-only. **Nothing with an `authenticated` token can insert, amend or
delete a row** — there are no write policies at all. Every entry arrives
through a `SECURITY DEFINER` trigger, which runs as the table owner and is
therefore not subject to those policies.

| Column | Notes |
|---|---|
| `actor_id` | Who did it. Always `my_staff_id()`, resolved server-side — never supplied by a client |
| `subject_id` | Who it was done **to** |
| `related_id` | The third party, where there is one (a reassignment's new owner) |
| `field` / `old_value` / `new_value` | Generic, so a status change and a phone change share one row shape |
| `severity` | `operational` (touches a child) or `routine` (sign-ins, profile edits) |

**Actions:** `duty_submitted`, `attendance_override`, `duty_reassigned`,
`alert_resolved`, `role_changed`, `class_changed`, `student_added`,
`student_status_changed` (operational); `signed_in`, `profile_updated`,
`staff_added` (routine).

---

## Who can read the log

Three tiers, one policy:

| Role | Sees |
|---|---|
| `admin` | Everything, routine traffic included |
| `coordinator`, `management` | Operational entries only — the attendance record, without everyone's sign-ins and photo changes |
| `teacher`, `nurse` | Only entries naming them: what they did, and what was done to their duties |

Everyone, including a teacher, always sees their own actions regardless of
severity.

---

## Reporting

`009` adds no stored data — a view and two functions, computed from
`attendance`, so a report can never drift from the marks it describes.

- **`attendance_detail`** — the four-table join every report needs, written
  once. Adds `status_label` (`'Present'` for null), `present` and `accounted`.
- **`student_attendance(admission, from, to)`** — one child's marks.
- **`student_attendance_summary(admission, from, to)`** — totals and percent.

All three are `security_invoker` / `security invoker`: RLS on the underlying
tables still applies. They move the SQL, not the permissions.

Ready-made queries: [`reports.sql`](reports.sql).

---

## Rules that are easy to get wrong

1. **Present is `NULL`.** `count(*) where status = 'A'` counts absences;
   `count(*)` counts children checked; `where status is null` counts present.
2. **`submitted_by` ≠ `staff_id`** means someone covered. It is not a bug.
3. **`corrected_by` does not replace `submitted_by`.** A corrected record has
   both, and the original author stays.
4. **Never edit an applied migration.** `001`–`009` are history. Add the next
   number instead.
5. **RLS failures are silent.** A policy that is too strict returns zero rows,
   not an error. Test both directions with a real token — see the table in
   `supabase/README.md`.
