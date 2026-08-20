# Supabase setup

Everything needed to rebuild the backend from nothing — a new project, a
staging copy, or recovery if the current one is lost.

## Files

| File | What it does |
|---|---|
| `migrations/001_schema.sql` | Tables, keys, indexes |
| `migrations/002_rls_policies.sql` | Row-Level Security for every table |
| `migrations/003_storage_avatars.sql` | Storage policies for profile photos |
| `migrations/004_class_teacher_history.sql` | Class-teacher history + its read policies |
| `migrations/005_cover_marking.sql` | Any teacher may mark any pending checkpoint |
| `migrations/006_attendance_override.sql` | Oversight roles may overrule a submitted record; `audit_log` |
| `migrations/007_audit_visibility.sql` | Logs submissions and reassignments too; lets staff read their own entries |
| `migrations/008_activity_and_alerts.sql` | Every staff action logged, tiered by severity; `alert_resolutions` |
| `migrations/009_reporting.sql` | `attendance_detail` view + per-student history functions |
| `seed.sql` | Status types, checkpoints, staff, pilot duties |
| `../docs/data/students_415_insert.sql` | The 415-student register |

## Applying to a fresh project

**1. Create the project** — region Mumbai (closest to the school; keeps latency
low and data in-country, which SRS §14 P2 asks for).

**2. Run the migrations in order** in the SQL Editor: `001` … `009`.

`005` is what makes the app's "Whole school" view and cover marking work. Until
it is run, the database still answers with only the signed-in teacher's own
duties no matter what the app asks for, and submitting a colleague's checkpoint
fails with a policy error — the Duties screen says so on screen rather than
showing an identical-looking list.

**3. Create the storage bucket.** Storage → New bucket:
```
name             avatars
public           yes
file size limit  2 MB
allowed types    image/jpeg, image/png, image/webp
```
The bucket cannot be created from SQL, which is why `003` only holds policies.

**4. Create the Auth users.** Authentication → Users → Add user, one per staff
email in `seed.sql`, with **Auto Confirm** on. Emails must match exactly — the
linking step at the end of `seed.sql` pairs them up.

**5. Run `seed.sql`**, then `docs/data/students_415_insert.sql`.

**6. Point the app at it.** Create `.env` in the repo root:
```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```
Use the **anon** key. The `service_role` key bypasses every policy in `002`
and must never be in the app or the repo.

## Verify before trusting it

RLS bugs are silent — the SQL reads correctly and the app fails, or worse,
doesn't. Two reached the running app during development for exactly that
reason. After applying, sign in as a real user and confirm both directions:

| Check | Expected |
|---|---|
| Teacher updates their own phone | succeeds |
| Teacher sets their own `role` to `admin` | **rejected** |
| Teacher edits another staff member's row | **rejected** |
| Teacher renames a student | **rejected** |
| Coordinator reassigns a duty | succeeds |
| Teacher reassigns someone else's duty | **rejected** |
| User uploads a photo to their own folder | succeeds |
| User uploads into another user's folder | **rejected** |
| User lists another user's folder | **empty** |
| Teacher edits a *submitted* attendance row | **rejected** |
| Management edits the same row | succeeds |
| …and `audit_log` gains a row naming them | yes |
| Anyone inserts into `audit_log` directly | **rejected** |
| Teacher reads `audit_log` after submitting | their own entry only |
| Teacher reads an entry for a duty that is not theirs | **empty** |
| Teacher B covers A's duty; A reads the log | sees B's submission |
| Teacher changes their phone | logged `routine`; coordinator can't see it, admin can |
| Coordinator resolves an alert; app restarts | the remark is still there |
| Teacher resolves an alert on a duty not theirs | **rejected** |

A quick way to run these is `curl` against the REST API with a token from
`POST /auth/v1/token?grant_type=password`.

## Making changes from now on

**The one rule: never edit a migration that has already been applied.**
`001`–`003` are history. Changing them means the live database and the files
disagree, and nobody can tell which is right.

To change anything — a new column, a new table, a policy fix:

1. Create the next numbered file, e.g. `migrations/004_add_spanning_statuses.sql`
2. Write it so re-running is harmless (`if not exists`, `drop policy if exists`
   before `create policy`)
3. Run it in the SQL Editor
4. **Verify it** against a real user token (see the table above)
5. Commit the file

That way `001` → `004` replayed in order always produces the current database.

Same applies to changes made through the dashboard UI — if you add a column by
clicking, write the equivalent `alter table` into a migration file afterwards,
or the next rebuild silently loses it.

## Optional: the Supabase CLI

Copy-pasting into the SQL Editor is fine at this size. If it starts to drag,
the CLI applies the whole folder in one command:

```bash
npm install -D supabase
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from the dashboard URL
npx supabase db push                                  # applies migrations/ in order
```

`db push` tracks which migrations have run, so it only applies new ones. It
does not run `seed.sql` — that stays manual, which is what you want, since
seeding a live database twice is rarely intended.

## Reports and the data model

Every table, who writes to it and who can read it:
[`docs/reference/data-model.md`](../docs/reference/data-model.md).

Ready-made SQL for the office — per-student records, class summaries, repeat
absentees, unresolved absences, health checks:
[`docs/reference/reports.sql`](../docs/reference/reports.sql).

## Not built yet

The SRS also calls for `spanning_statuses`, `alerts`, and the Module F tables
(`gate_passes`, `sickbay_admissions`). Schemas for all of them are in
`docs/reference/self-build-guide.md` §3. Add them as the next numbered
migration when that work starts — creating them early avoids reworking the
schema later.

`audit_log` (`006`–`008`) now records submissions, cover marking,
reassignments, overrules, alert resolutions, profile and role changes, and
sign-ins. `alert_resolutions` (`008`) persists the remark; the alert itself
stays derived from attendance and is not stored.
