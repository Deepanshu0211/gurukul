
Bhaktivedanta Gurukula and International School
Attendance & Student Safety System
Software Requirements Specification — for developer quotation
Version 1.2 (Draft) · 19 July 2026
1. Background and objectives
The school is a residential (gurukula) and day school with approximately 415 students in Grades 2–12 (285 residential, 112 day scholars, 17 Vedic school, 1 day boarding) across 23 class-sections, and about 30 teaching and ashram staff. To ensure every child is accounted for and safe, attendance is taken 8–10 times per day at checkpoints from Mangalarati (approx. 4:30 AM) through night attendance (approx. 9:30 PM). Today this is done on paper proformas signed through a chain of Teacher, Ashram Coordinator, MOD, and Principal.
The objectives of the new system are: (1) fast digital marking at every checkpoint by the assigned teacher on a mobile device; (2) automatic summaries to management after every checkpoint and automatic reminders and escalation when a teacher misses one; (3) immediate safety alerts when a child who was present earlier in the day becomes unaccounted for; (4) central storage of all records with reports that identify students attending all activities regularly and students needing special attention to catch up; and (5) simple administration of student and staff records, individually and by bulk import from the school&apos;s existing Excel registers; and (6) four safety and operations extensions built on the same engine: gate pass and outing management, a sick bay module for the nurse, an emergency muster mode, and an automatic kitchen headcount feed (Module F).
A working interactive prototype accompanies this document (gurukula-attendance-prototype.jsx). It demonstrates the intended behaviour of all four modules using the school&apos;s real 2025–26 student register and report formats, and should be treated as part of the specification.
2. Users and roles
Role
Typical people
What they can do
Teacher / duty staff
Class teachers, ashram teachers, prasadam in-charge, sports teachers, wardens
See and mark only their own assigned duty groups; receive reminders; view their own history
Coordinator
Ashram Coordinator, MOD, academic coordinator
Everything a teacher can, plus: edit the duty roster, reassign duties, set spanning statuses (Home/Sick/Outing), mark on behalf of an absent teacher (backup marking), view all records
Management
Principal, school management
Read-only dashboard of all checkpoints, summaries, alerts and reports; receives all escalations
Administrator
Office administrator
Manage student and staff records (add, edit, deactivate, bulk import/export); manage logins and roles; configure checkpoints and time windows

Each user has an individual login linked to a phone number. Role-based access control is mandatory (see Section 14).
3. Key definitions
Checkpoint  — a named attendance event with a daily time window, e.g. Morning attendance 7:30–7:50 AM.
Student group  — the set of students covered by one marking action. Supported group types: a class-section (e.g. 7 Krishna), a grade band (Primary Gr 2–5, Middle Gr 6–8, Senior Gr 9–12), residential-only variants of either, the whole school, or a custom saved list (e.g. remedial batch). A student may belong to many groups simultaneously; all attendance lands against the same student record.
Duty  — one checkpoint + one student group + one assigned marker for a given day. The duty roster (Section 7) maps duties to staff, with defaults and per-day overrides.
Spanning status  — a status (Home, Sick, Outing) set once with a start and expected end, which pre-fills that student&apos;s status at every checkpoint until cleared (Section 5).
4. Data model
The exact schema is the developer&apos;s choice; the entities and fields below are required. Field names for students must map one-to-one to the school&apos;s existing register (Student_List_2025-26.xlsx) so imports work without re-formatting.
Entity
Required fields
Student
Admission No. (unique ID, e.g. S2401021), Student Name, Class (2–12), Section (A / KRISHNA / BALRAM / Vedic), Student Type (Residential / Day Scholar / Vedic School / Day Boarding), House (Govardhan / Vrindavan / Nandgaon / Barsana / unassigned), Roll No, Year of Joining, Old/New, active flag, joining & leaving dates, photo (optional), parent contact (optional, phase 2)
Staff
Name, role, phone (for reminders), login credentials, active flag
Checkpoint
Name, time window (start–end), days applicable (weekday / Saturday / Sunday schedules differ), population rule (all vs residential-only), reminder & escalation timings
Duty roster entry
Checkpoint, student group definition, assigned staff, date or recurring default, override history
Attendance record
Student, checkpoint, date, status (one of seven), marked-by staff, timestamp, device/offline-sync metadata; records are immutable once submitted except by coordinator correction with audit trail
Spanning status
Student, status (Home/Sick/Outing), set-by, start datetime, expected end, cleared-by & cleared-at, remarks
Audit log
Every create/edit/delete/deactivate/import/roster-change with user and timestamp
5. Attendance statuses and rules
Eight standard entry types ship with the system. Only Absent means the child is unaccounted for; every other non-present entry means the school knows where the child is. The list itself is configurable (S7): optional entries can be switched off and new entry types added by the Administrator without developer involvement.
Status
Meaning
Accounted?
Spanning?
Present
At the checkpoint (default for every student)
Yes
No — per checkpoint
Absent
Not at the checkpoint and whereabouts unknown
NO — triggers alerts
No — per checkpoint
Home
With family / not reported back
Yes
Yes — with duration
Sick
In sick bay or resting under nurse&apos;s knowledge
Yes
Yes — with duration
Activity
In a supervised task elsewhere (Goshala, Vrindaranyam, seva, event duty)
Yes
Per checkpoint (recurring rule optional)
Outing
Off campus with permission
Yes
Yes — with duration
Gita Nagari
At the Gita Nagari community / affiliated campus
Yes
Yes — with duration
Self study
Studying separately instead of this checkpoint
Yes
Per checkpoint (recurring rule optional)

S1  Marking defaults to Present for every student in the group; the marker changes only the exceptions (exception marking).
S2  Only Absent counts as unaccounted. Summaries present three top-line numbers: Present, Accounted elsewhere (with breakdown), Absent with names.
S3  Spanning statuses (Home, Sick, Outing) are set once with an expected end (e.g. &apos;Home until Sunday 6 PM&apos;) and pre-fill every subsequent checkpoint list until cleared or expired. The marking teacher may override for a single checkpoint (e.g. child returned early), which prompts the coordinator to clear the spanning status.
S4  Authority to set spanning statuses: Coordinator role for Home and Outing; Coordinator or nurse for Sick. (To be confirmed by the school — see Section 15.)
S5  Recurring rules are supported for Activity and Self study (e.g. &apos;Grade 11 self study replaces sports on Wednesdays&apos;).
S6  Day scholars are automatically excluded from residential-only checkpoints (Mangalarati, breakfast/dinner prasadam, evening self study, night attendance).
S7  Configurable entry types: Present and Absent are fixed and cannot be disabled. All other entries are optional — the Administrator can enable or disable each one, and can add new custom entry types (name, accounted yes/no, carries-forward yes/no) which appear in marking menus immediately. Custom accounted types are grouped under accounted-elsewhere in summaries and reports.
S8  Teacher-initiated carry-forward: if a child has gone Home (or on Outing / to Gita Nagari) and the office or coordinator has not yet recorded it, a duty teacher marking that entry at any checkpoint creates a provisional carry-forward automatically — it pre-fills all subsequent checkpoints and immediately notifies the Coordinator, who confirms it (setting the expected return) or corrects it. The entry remains visually flagged as provisional until confirmed, and the office clears it when the child returns. A later Present or Absent mark for the child ends the carry and alerts the Coordinator to reconcile.
6. Checkpoints (initial configuration)
Checkpoints, windows and groupings are configurable by the administrator without developer involvement. The initial weekday configuration, based on the school&apos;s current report book:
Checkpoint
Indicative window
Population
Marked by (default)
Mangalarati
4:30 – 5:00 AM
Residential, whole school
Ashram Coordinator / ashram teachers
Breakfast prasadam
6:45 – 7:30 AM
Residential, by band (Primary / Middle / Senior)
Prasadam in-charge & duty teachers
Morning attendance
7:30 – 7:50 AM
All students, by class-section
Class teachers
Morning self study
As scheduled
Residential, by band
Ashram teachers
Lunch prasadam
12:30 – 1:10 PM
All students, by band
MOD / prasadam in-charge
Evening sports
4:30 – 5:10 PM
All students, by band
Sports teachers 1–3
Remedial class
5:15 – 5:45 PM
Custom list (Res and Day tracked separately)
Remedial in-charge / subject teachers
Evening self study
6:30 – 7:00 PM
Residential, by band
Ashram teachers
Dinner prasadam
7:15 – 7:55 PM
Residential, by band
Prasadam in-charge
Night attendance
9:15 – 9:40 PM
Residential, by band or house
Ashram teachers / wardens

C1  Saturday morning and Sunday follow separate configurable schedules, as in the current report book.
C2  Breakfast/dinner prasadam and night attendance are designated mandatory-escalation checkpoints: a missed submission escalates to the Principal, not only the Coordinator.
7. Module A — Teacher mobile app
A1  Android app (iOS optional phase 2), usable on low-end phones; also accessible as a mobile web app.
A2  Home screen shows only the signed-in person&apos;s duties for today with status: Upcoming, Due now, Submitted (with time and counts), or Overdue.
A3  Marking screen: students grouped by class within the group, each defaulting to Present with any spanning status pre-filled; single tap toggles Absent; a per-student menu selects Home / Sick / Activity / Outing / Self study. Each row shows name, class, roll number and Res/Day.
A4  Marking a 40-student group must be possible in under two minutes; submission shows a confirmation summary.
A5  Offline-first: marking works with no network and syncs automatically when connectivity returns; the record carries both the marked time and sync time.
A6  Once submitted, a record is locked for the teacher; corrections go through the Coordinator and are audit-logged.
A7  Cross-check after submission: the teacher can reopen any of their submitted duties in read-only mode showing every student&apos;s recorded status and the submission time. Entries remain locked; corrections are requested from the Coordinator (A6).
A8  Class day view: a class teacher can view their own students&apos; statuses across all checkpoints marked so far today by any duty teacher, to cross-check and follow up. Visibility is limited to their own class only.
A9  Optional speed aids (nice to have): student photos on rows; QR/barcode scan of ID cards for large mixed gatherings.
8. Module B — Duty roster
B1  Coordinator screen listing every duty for a chosen day, grouped by checkpoint, showing group, student count, assigned staff and submission status.
B2  Any duty can be reassigned to any staff member. A change for a single date is an override; weekly/recurring defaults (e.g. rotating prasadam and ashram duty) are configured once and roll forward automatically.
B3  Reminders and escalations always follow the currently assigned person, including same-day substitutions.
B4  Backup marking: designated Coordinator roles may mark any duty; the record shows it was marked by backup.
B5  Deactivating a staff member automatically flags their pending duties for reassignment (default: Ashram Coordinator) and notifies the Coordinator to review.
9. Module C — Reminders, summaries and escalation
N1  Reminder to the assigned marker 10 minutes before the window closes if not yet submitted (push notification and WhatsApp; SMS fallback). Timing configurable per checkpoint.
N2  At window close without submission: escalation to Ashram Coordinator and MOD naming the checkpoint, group and assigned teacher. Ten minutes later, still unsubmitted: escalation to the Principal. Mandatory-escalation checkpoints (C2) go to the Principal immediately.
N3  Immediately after each submission, an automatic summary goes to Coordinator, MOD and Principal (WhatsApp and dashboard), e.g.: &apos;Breakfast prasadam · Senior (Gr 9–12): 138/149 present, 9 accounted (Home 4, Sick 3, Outing 2), 2 ABSENT: <names, class, house>&apos;. The Res/Day split is shown wherever both types are present.
N4  A whole-school checkpoint digest is sent when all groups of a checkpoint have submitted, mirroring the current proforma totals row.
N5  WhatsApp Business API (or an equivalent approved provider) for outbound messages; delivery failures fall back to SMS and are logged.
10. Safety cross-checks
F1  On every submission, the system compares each student marked Absent against the same day&apos;s earlier checkpoints. A student present (or accounted) earlier and Absent now triggers an immediate red alert to Coordinator, MOD and Principal with the student&apos;s name, class, house, and last-seen checkpoint and time.
F2  End-of-window sweep: any residential student who appears in no submitted group for a checkpoint (e.g. because a group was never marked) is listed as unverified in the digest.
F3  Night attendance closure: after the night checkpoint, a final reconciliation lists every residential student not marked Present/accounted at night, regardless of earlier statuses. This list must be actively acknowledged by the Coordinator or Principal in the app.
F4  Alerts are never silently auto-resolved; each alert is closed by a user with a remark (e.g. &apos;found in library&apos;), all logged.
11. Module D — Reports
R1  Daily reports exportable to Excel/PDF in the school&apos;s existing proforma layouts (SCHOOL_ATTENDANCE_REPORT_2025.xlsx): per class-section rows with Res, Day, Total, Res P, Day P, Res A, Day A, Home, Sick, Activity/Outing/Self-study, totals row, absent student names grouped Primary/Middle/Senior, and marked-by names with timestamps in place of physical signatures. Sheets required: Mangalarati, Morning attendance, self study (morning/evening), prasadam (breakfast/lunch/dinner by band), Remedial (Res and DS), Sports, Night, Saturday morning, Sunday.
R2  Regularity report: per-student attendance percentage per checkpoint type over any date range, filterable by class, house, and student type; sortable ascending to surface weakest attendance.
R3  Needs-special-attention list: auto-generated every Monday — students below a configurable threshold (default 80%) in Remedial or Self study over the trailing 14 days — emailed/WhatsApped to the academic coordinator.
R4  Individual student ledger: full attendance history for one child, for parent meetings and inspections.
R5  Monthly management pack: school-wide trends, chronic absentee list, checkpoint compliance by teacher (submissions on time vs late vs escalated).
R6  All data exportable in open formats (CSV/Excel) at any time — no vendor lock-in.
12. Module E — Student & staff administration
D1  Add student individually via form (Admission No., name, class-section, type, house, roll) with duplicate Admission No. check; new students appear in matching groups from the next checkpoint.
D2  Bulk import from CSV or Excel using the existing register columns exactly (Sr No., Admission No., Class Name, Section Name, Student Name, Student Type, Year of Joining, Old/New, House, Roll No). Import shows a validation preview before saving: errors (missing Admission No. or name, unknown class-section, Admission No. already in system, duplicate within file) are skipped with row-level messages; warnings (unknown type mapped to Day Scholar, house unassigned) import with flags. A downloadable template is provided.
D3  Edit and deactivate students. Deactivation (not deletion) removes the student from all future lists, keeps full history, records a leaving date, and is reversible. The same applies to staff (see B5). Hard delete is available only to the Administrator for records created in error, and is audit-logged.
D4  Add/edit/deactivate staff individually and by import; each staff member is linked to a phone for reminders and a login.
D5  Section and house management: create/rename class-sections and houses; a bulk tool to assign houses to the currently 124 unassigned new students.
D6  Every admin action is audit-logged (who, what, when, before/after values).
13. Module F — Safety and operations extensions
Four extensions reuse the same student records, statuses and notification channels as the core system. They are delivered as milestone M4, but their entities (gate passes, sick-bay admissions, muster plans, kitchen counts) must be reflected in the database design from M1 to avoid rework.
13.1 Gate pass and outing management
G1  Outing workflow: a request (student(s), destination, accompanying adult, expected departure and return time) is raised by a teacher or coordinator and approved by the Coordinator or Principal. Approval automatically sets the Outing spanning status for the period.
G2  A digital gate pass with a QR code is generated; gate staff record actual out-time and in-time against it on a simple phone screen, and the in-time clears the Outing status.
G3  Return check: if the student is not recorded back in and is not marked Present at any checkpoint within a configurable grace period after the expected return time, an automatic alert goes to Coordinator, MOD and Principal.
G4  Home departures use the same flow with a parent/guardian pickup acknowledgment at the gate (name and relationship recorded; OTP to the registered parent number optional — see Section 16).
G5  Gate register report: all movements for any date range, filterable by student and class, with a standing list of pending returns.
13.2 Sick bay module (nurse)
K1  Nurse role with its own login. Admitting a student to sick bay sets the Sick spanning status automatically; discharge clears it. Duty teachers never need to mark sick-bay students manually.
K2  Per-admission record: date/time in and out, complaint, temperature/vitals, medicines given with times, remarks, and whether parents were informed.
K3  Meal link: students in sick bay at meal checkpoints are counted as meals-to-sick-bay in the kitchen feed (13.4), not in dining-hall numbers.
K4  Escalation: an admission longer than a configurable duration (default 24 hours), or repeated admissions (default 3 within 14 days), notifies the Coordinator and Principal and appears on the management dashboard.
K5  Health register reports per student and per period. Sick-bay clinical details are visible only to the nurse, Coordinator and Principal (extends Section 14); duty teachers see only the Sick status.
13.3 Emergency muster mode
E1  The Principal, Coordinator or MOD can trigger a muster with one action, selecting scope (whole school or residential only) and reason (drill / fire / missing child / other).
E2  Triggering pushes an unscheduled roll-call duty to every staff phone simultaneously, using a pre-configured muster plan: assembly points and which staff count which classes at each point.
E3  Live muster board on the management screen: accounted vs unverified counts updating in real time as staff submit, with unverified students always listed by name and class. Students covered by spanning statuses (Home, Outing, sick bay) are auto-accounted and shown separately for verification.
E4  Muster marking is optimised for speed: tap-Present (the reverse of normal exception marking) or QR scan. Target: full-school accounting in under five minutes.
E5  Every muster produces a timestamped report (who triggered it, time to full accounting, history of the unverified list, who closed it) for drill records and inspections. Drill mode is clearly labelled in all notifications so it is never mistaken for a real emergency.
13.4 Kitchen headcount feed
H1  Before each meal, the kitchen in-charge receives expected numbers via WhatsApp and/or a read-only screen: dining-hall count by band, meals to sick bay, and adjustments from gate passes and spanning statuses — all derived automatically, with no manual compilation.
H2  An evening summary sends tomorrow’s expected breakfast, lunch and dinner counts based on known Home/Outing schedules and approved gate passes.
H3  After each prasadam checkpoint is submitted, actual vs expected is stored; a weekly variance report helps the kitchen calibrate quantities and reduce waste.
H4  The kitchen sees counts only — no student names or personal data.
14. Access control and data protection
The system holds personal data of minors, so this section is non-negotiable.
P1  Individual logins for all users; no shared accounts. Role-based access as per Section 2 — a teacher sees only their duty groups; only Management/Coordinator roles see whole-school data.
P2  All traffic encrypted (HTTPS/TLS); database encrypted at rest; hosting in an Indian data-centre region preferred.
P3  Automated daily backups with at least 30-day retention and a documented restore procedure; a restore test is part of acceptance.
P4  Compliance with India&apos;s Digital Personal Data Protection Act, 2023, including its provisions on children&apos;s data; no student data used for any purpose beyond the school&apos;s operations; no third-party analytics/ads SDKs in the app. These rules extend to Module F data (gate movements, health records).
P5  Session timeouts, password reset via OTP, and immediate access revocation on staff deactivation.
15. Non-functional requirements
Q1  Scale: 800 students, 60 staff, 12 checkpoints/day, 3 academic years of history without performance degradation.
Q2  Availability 99% during 4:00 AM – 10:30 PM IST; graceful offline behaviour otherwise (A5).
Q3  Paper fallback: a one-click printable blank register per checkpoint for power/network failure days, with later back-entry marked as such.
Q4  Languages: English interface at launch; Hindi optional phase 2.
Q5  Technology: developer&apos;s choice, but must be maintainable by a typical local team (e.g. Flutter/React Native client with a PostgreSQL/Supabase/Firebase backend and a web dashboard). Source code and deployment documentation are handed over to the school.
16. Decisions pending with the school
Who may set spanning statuses: Coordinator only, or also the nurse for Sick (S4)?
Whether Vedic School students count as residential for prasadam/night checkpoints (currently assumed yes).
Final Saturday and Sunday checkpoint schedules.
WhatsApp Business API vs SMS as the primary channel, and which numbers receive management digests.
Whether night attendance should be marked by band, by house, or by dormitory.
The muster plan: assembly points and which staff count which classes during an emergency (needed for E2).
How the kitchen receives headcounts — WhatsApp to the in-charge, a display screen, or both.
Whether parent OTP confirmation is required at gate pickup, or a signed gate-register entry suffices.
17. Deliverables, milestones and acceptance
Suggested phasing (indicative 11–14 weeks total):
Milestone
Scope
Acceptance highlights
M1 · Pilot (≈3 weeks)
Teacher app marking with 7 statuses, seeded roster, checkpoint summaries to WhatsApp, student import from the existing register
Two class-sections and one prasadam band run fully digital for one week in parallel with paper; 40-student group marked in <2 min; summaries received within 1 min of submission
M2 (≈3 weeks)
Full duty roster with defaults/overrides, reminders & escalation, safety cross-checks F1–F4, spanning statuses
A simulated missed checkpoint escalates on schedule; a planted present-then-absent case alerts within 1 min; Home-until-Sunday pre-fills correctly
M3 (≈3 weeks)
Reports R1–R6 incl. proforma Excel exports, admin module complete, access control & backups, whole-school rollout
Exported daily report matches the current proforma column-for-column; restore-from-backup demonstrated; all staff onboarded
M4 (≈3–4 weeks)
Module F: gate pass & outing workflow, sick bay module, emergency muster mode, kitchen headcount feed
A test outing with a missed return alerts on schedule; a sick-bay admission sets and clears Sick automatically and shifts the kitchen count; a full-school drill muster reaches complete accounting in under 5 minutes on the live board

Quotations should state: total cost and payment schedule, timeline, team, hosting and messaging running costs (monthly), warranty/support terms for year one, and cost of an annual maintenance contract thereafter. Source code ownership transfers to the school on final payment.
Reference budget expectation for a build of this scope including Module F: ₹2–5 lakh development plus modest monthly hosting/WhatsApp costs; vendors quoting far outside this range should justify the difference.
Appendix A — Reference documents
Student_List_2025-26.xlsx — the authoritative student register and import format (415 students).
SCHOOL_ATTENDANCE_REPORT_2025.xlsx — current paper proformas whose layouts the report exports must reproduce.
gurukula-attendance-prototype.jsx — interactive prototype demonstrating intended behaviour of all modules with the school&apos;s real data.