# School pilot: Physical Activity

## Agreed attendance setup

- Trial dates: 3 October–2 November 2026 (one calendar month, 31 attendance days).
- One register per class grade per day for Physical Activity,
  combining Krishna, Balram and Vedic residential students within that grade.
- Physical Activity opens at 06:15 Asia/Kolkata and closes at midnight.
- Only residential students are included: 328 of the 440 imported students.
- 10 residential grades have duties; Class 2 has only day scholars and has none.
- Classes are allocated across Jeewenth sir, Kapil sir, Jagannath sir and Neeraj sir.
- Teachers see their assignments under My duties and can cover another class
  through Whole school. The original owner and actual submitter are retained.
- The coordinator or admin may reassign class duties through the existing app flow.
- The first submission finalizes the register. Coordinator, admin and management
  can correct it afterward; the audit log records corrections.
- Midnight creates a new daily register; yesterday's records remain in history.
- Records and its register exports show only the teacher's academic class/section,
  including that section's students inside a combined-grade register.
- Duties and Today's status follow the teacher's checkpoint assignments for the
  selected date. Reassigning a checkpoint does not change the academic class.

## Separate environments

The existing development, preview and production profiles still target the mock
project. The new `pilot` profile targets the school pilot project. Server-only
database and Auth Admin secrets must never be copied into EAS build configuration.

Private environment files live outside this repository in
`../_private-real-data/.env.mock.local` and `.env.pilot.local`.
The active local `.env` now contains the pilot URL and public app key only.
The mock project and its data remain separate and unchanged.

```powershell
npm run start:mock
npm run start:pilot
npx eas-cli build --platform android --profile pilot
```

The local start commands select only the public app URL and key and disable
implicit dotenv loading. Creating a pilot bundle does not switch an installed
mock APK; the APK must be rebuilt or a development client must load that bundle.

## Database provisioning

**Applied on 2 October:** the live database now has 10 class registers per day,
combining sections within each grade. There are 310 registers across the 31
trial dates, plus 10 normal registers for today's developer testing. The plan
and SQL are in
`../_private-real-data/artifacts/pilot-physical-activity/combined-class-plan.json`
and `combined-class-runtime.sql`. The private
`consolidate_physical_classes.py --apply` runner applied this in one transaction.
It backed up the pilot and checked for existing attendance/audit references before
replacing empty pending registers, preserves student sections and staff accounts,
and verified generation and report totals. A complete 40-student combined Class
10 submission passed, and incomplete, day-scholar, other-grade and duplicate
submissions were rejected. All test marks were rolled back. The refreshed
emulator shows the 10 combined duties and teacher names ending in sir. A final
release APK check remains required before distribution.

The original complete schema and pilot configuration were deployed, with seven staff
accounts and 682 class duties across the 31 trial dates. The private
runner at `../_private-real-data/tools/configure_physical_activity_pilot.py`
restricts its target to the pilot ref and checks the initial database state.

It backs up the initial data, applies 001–034 in one transaction, defers the mock
schedule catch-up calls from 024/028/029, and finally applies
`supabase/pilot/physical-activity.sql`. Mock student/staff/duty seeds are not used.
It adapts class and Saturday report counts to residential attendance and records the
source hashes and deferred calls in a private receipt. This runner does not
claim a Supabase CLI migration history for the adapted deployment.

The final environment marker is `school-pilot`. Destructive `reset_school_day`
is disabled, its cron job is removed, and only nightly register generation
remains (18:30 UTC / midnight IST). Do not replay testing seeds or the migration
folder directly against this pilot: migration 027 enables destructive test
helpers, and the standard generator assumes the mock school schedule.

## Verification and release

Backend validation passed for all seven Auth logins and their Data API reads,
anonymous and inactive-user restrictions, residential-only registers, the
06:15/midnight window, complete class submission, substitute submission,
duplicate submission rejection, coordinator reassignment, principal corrections,
audit records, and residential report totals. Submission tests ran in rollback
transactions: no fabricated attendance or scratch duties remain in the database.

The private validation receipt and class assignment CSV are in
`../_private-real-data/artifacts/pilot-physical-activity/`.
The installed Android development app was tested on emulator-5554 with teacher
and coordinator logins. My duties/Whole school, residential class previews,
tomorrow's opening lock, coordinator reassignment controls and dashboard totals
were checked. Future-date countdown and premature all-clear messages were fixed.
The compiled bundle contains the pilot public URL/key and no database URI or
service-role secret. These checks are recorded in `app-verification.json`.
The emulator/development-bundle check is separate from a final release APK test.
Test the resulting APK on a device before distributing it.

APK creation is on hold until the user verifies the setup and asks to proceed.

The first checkpoint opens on 3 October 2026 at 06:15 IST. Register generation
is restricted to the 31 trial dates; records remain available afterward.

The initial seven-day deployment was extended through 2 November using
`../_private-real-data/tools/extend_pilot_month.py`. Its receipt preserves the
original setup history and verifies that existing duties and attendance were
unchanged. The app reads `trial_end` from the database to allow the full date range.

## Developer testing and requested resets

2 October has 10 normal combined class registers for testing before the school trial.
The app opens on today, with the same submission and ownership rules used at
school. There are no practice labels, reset controls or test-mode switches.
When the user asks to reset test attendance, the developer runs
`../_private-real-data/tools/reset_pilot_test_attendance.py --day YYYY-MM-DD`.
The tool targets only the pilot project, backs up the selected day's records,
clears that day's marks and reopens its registers. Student, staff, Auth accounts,
assignments and other dates remain intact. It is never scheduled automatically.
