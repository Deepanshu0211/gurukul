# Vedic attendance grouping - pilot rollout scheduled

## One categorisation rule

For every activity and every date, students from Vedic sections appear together in
one **Vedic** attendance category. Their original academic class stays visible,
such as **Class 4 Vedic**. Krishna and Balram keep their regular class groups.
Residential-only activities still exclude day scholars.

The existing combined-grade key (`grade|*`) stays in use. The only new group key
is `*|VEDIC`. Future regular duties set `exclude_vedic=true`; saved duties keep
their stored membership so their original submissions remain auditable.

## Saved attendance

Marks are not moved, deleted, duplicated or reset. The original duty ID, status,
submitter, submission time and correction history remain in the source tables.
Records groups saved submissions for display, and the SQL reporting view and
status board recalculate categories for all dates. There is no separate old report
implementation, no `REGULAR` key and no historical cutover in report logic.
If several teachers originally marked Vedic students, their names and source times
remain available. An unsubmitted source register never becomes a Present mark.

## Database changes and activation

1. `supabase/migrations/035_vedic_attendance_groups.sql` is applied on mock
   and pilot. Pilot application was approved on 5 October 2026.
   It adds validation, a single status-board implementation and the read-only
   `attendance_report_groups` view. Headcount printing in this app version requires
   that view. The existing headcount RPC signature is retained for installed clients.
2. `supabase/pilot/vedic-guards.sql` and `supabase/pilot/vedic-rollout.sql`
   are applied on pilot. The current pilot generator
   is updated in place; no duplicate legacy generator or health check is retained.
3. Pilot activation is scheduled from **6 October 2026**, with **Supriya maam**
   (`t11`) as the Vedic teacher. Her Records class is `*|VEDIC`.
   `activate_vedic_attendance(start_date, staff_id)` requires coordinator/admin.
   This start date only controls future assignments, not historical reporting.
   Existing pending regular duty IDs and owners remain unchanged. Days containing
   any saved attendance cannot have their source register membership changed.
4. Mock and pilot rollback tests passed. Installed older APKs cannot resolve `*|VEDIC`
   or exclude Vedic students from regular duties. Future assignment activation
   therefore requires coordinated updated APK distribution **before 6 October
   at 06:15 IST**. The user approved activation now and plans distribution on
   5 October. Older APKs remain incompatible with the new future registers.

## Current school count check

The 5 October read-only count check found 328 residential students: 298 regular
and 30 Vedic, across Classes 4, 5, 7, 9 and 10. One Vedic day scholar is included
only at activities open to day scholars.

## Mock verification - 4 October 2026

- The migration preserved all 48,416 existing attendance rows; complete row
  fingerprints matched before and after application.
- Mock originally had no Vedic students. Two synthetic residential students,
  from Classes 4 and 10, were added for testing (413 students in total).
- One Vedic register appears per activity, with the original academic class
  displayed beside each student. Submission was also tested in the emulator.
- Incomplete submissions and students outside the duty roster were rejected.
  Teacher cover submission worked; teacher resubmission without override was denied.
  Admin correction preserved the original submitter.
- Headcount, day and date-range reports agreed for three tested activities:
  six marks, three Present, two Absent and one elsewhere.
- `supabase/mock/vedic-duties.sql` updates the mock daily generator in place.
  Generating 6 October twice produced the same 29 duties, one Vedic register
  per activity, and no overlapping student membership within an activity.
- Client regression tests passed (26 tests), including preserved marks, authors,
  source IDs, separate activities and unsubmitted registers.

The mock fixtures and their test submissions remain available for review.
The emulator is running the mock environment; local pilot environment files
were not replaced. Version is 1.1.0. No APK was built.

## School pilot verification - 5 October 2026

- A full PostgreSQL logical archive was saved outside Git at
  `../_private-real-data/backups/pilot-before-vedic-20261005-183149-IST/`.
  It includes Auth and application tables. Archive listing and SHA-256 were
  verified; full disaster restoration has not been rehearsed. Storage object
  file contents and external project settings are outside the database archive.
- All **613 existing attendance rows** retained identical content. Students
  (440), account identities (14), saved duty IDs, submitters, existing audit rows,
  and the current/past registers were preserved.
- Today still has 10 source registers because nine already contained submitted
  attendance. Reports recategorise those saved marks without rewriting them.
- Each of the 28 dates from **6 October to 2 November** now has 11 duties:
  10 normal classes (Krishna/Balram combined by grade), plus one Vedic duty.
  Vedic contains 30 residential students, grouped across their original grades.
  Normal duties contain 298. Every eligible student belongs to exactly one duty.
  No Primary/Middle/Senior bands or additional activities were added to pilot.
- The nightly job remains active at midnight IST (`30 18 * * *` UTC). Repeated
  generation does not duplicate duties or change existing membership.
- Real-role rollback tests passed for full Vedic submission, incomplete and
  out-of-group rejection, residential eligibility, teacher overwrite denial,
  admin correction with preserved original submitter, regular-class submission,
  and future-day opening lock. No validation marks or scratch duties remain.
- Post-commit authenticated API reads passed for admin, Supriya maam and Neeraj
  maam: 11 duties, class counts, Vedic ownership and report access. Anonymous
  report access was denied.
- The merged Android JavaScript bundle compiled successfully with pilot public
  configuration. Its contents were checked for the pilot URL/key and absence
  of the database URI/password and service-role secret. The EAS pilot profile
  matches that configuration. This is not a release APK runtime test.

## Build handoff

Your friend's UI commit `5fda9c8` is merged with the local Vedic work. Git's merge
is intentionally uncommitted so the user can review and commit it. Local work
was preserved in a safety stash before integration.

Build **version 1.1.0** with the pilot profile:

```powershell
npx eas-cli build --platform android --profile pilot
```

Do not use `preview`, `development` or `production` for the school pilot: those
profiles target mock. No database password or service-role secret belongs in
the APK. Test the resulting release APK before school distribution; a development
bundle or API check does not verify the release binary. No APK was built here.
