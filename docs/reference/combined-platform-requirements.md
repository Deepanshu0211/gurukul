
Combined Software Requirements Specification
Unified School Management Platform
Attendance & Student Safety  +  Academic & Hostel Progress Tracker
Version 0.1 (Draft merge) · 19 July 2026 · Prepared by merging Attendance_System_Requirements_v1.docx (v1.2) and School_Progress_Tracker_SRS.docx (v2.1)
This document merges two previously separate requirement sets — the Attendance & Student Safety System and the School Progress Tracker — into a single platform. Sections 1–4 define what is now shared. Sections 5–6 carry the module-specific functional requirements, condensed from the two source documents (full item-level detail such as individual FR/R/S/N IDs remains in the originals and should be preserved during implementation). Section 7 lists exactly what redundancy this merge removes. Section 9 lists new decisions the merge itself creates, in addition to each source document&apos;s own open questions.
1. Introduction
1.1 Why combine them
Both systems serve the same residential-school community — the same students, the same teaching and hostel/ashram staff, the same administrator, and the same management/principal — and both need a student roster, a staff/login directory, role-based access, bulk Excel import, and Excel/PDF reporting. Building them as one platform with two modules, instead of two independent applications, removes duplicated screens, duplicated logins, and duplicated data entry, and lets each module reuse work already required by the other.
1.2 Combined scope
The platform covers, in one login per person and one student/staff roster:
Attendance & Safety module — digital marking at 8–10 daily checkpoints, duty rosters, spanning statuses (Home/Sick/Outing), reminders and escalation, real-time safety cross-checks, attendance reporting, and four operational extensions: gate pass/outing, sick bay, emergency muster, and kitchen headcount.
Progress Tracker module — goal-based tracking of seven learning-outcome categories (chapters, books, shlokas, songs, prayers, skills, services), progress status and remarks per student, teacher-to-student assignment, action items, and management completion/defaulter reporting.
Shared core platform — one authentication and role system, one student roster and one staff/teacher roster (each with a single bulk-import pipeline), one notification channel, one reporting/export engine, one audit log, and one mobile/web delivery mechanism, described in Section 3.
Scale note: the Attendance document specifies ~415 students (Grades 2–12, scaling to 800) and ~30–60 staff; the Progress Tracker document specifies ~300 students (Grades 3–12) and 20–30 staff. Confirm whether these describe the same student body — if so, use one roster sized to the Attendance figures (Section 9).
2. Users and Roles
The Attendance document defines four roles (Teacher/duty staff, Coordinator, Management, Administrator); the Progress Tracker defines three (Academic Teacher, Hostel Teacher/Warden, Admin/Management — a single combined role). The table below adopts the Attendance model as the platform-wide role structure, since it already separates day-to-day data control (Administrator) from oversight (Management) — the safer default for a system holding minors&apos; data — and folds the Progress Tracker&apos;s two teacher types in as category-scoped subtypes of &quot;Teacher.&quot; This split is flagged as a decision to confirm with the school in Section 9.
Role
Typical people
Attendance module access
Progress Tracker module access
Teacher / duty staff
Class teachers, subject (academic) teachers, hostel wardens, ashram teachers, prasadam/sports/remedial staff
Mark only assigned duty groups; view own duty history; reopen own submitted duties read-only
Create/edit goals and progress entries only within their authorized category (academic teachers: chapters, books, shlokas, songs, prayers; hostel teachers: skills, services); view only assigned students
Coordinator
Ashram Coordinator, MOD, academic coordinator
Edit duty roster, reassign duties, set spanning statuses, backup-mark, view all attendance records
No special access beyond their base Teacher rights, unless also holding a teaching assignment
Management
Principal, school leadership
Read-only dashboard: all checkpoints, summaries, alerts, reports; receives escalations
View completion/defaulter reports and action items; create and assign action items
Administrator
Office administrator
Manage student & staff records (add/edit/deactivate/bulk import); manage logins/roles; configure checkpoints
Manage student & staff records (shared with Attendance); bulk-load class-wide entries; manage teacher-to-student/grade assignments; override — create/edit any goal or entry in any category
2.1 Category permissions within the Teacher role (Progress Tracker)
The category-level write restrictions from the Progress Tracker (FR-1.4, Appendix A) carry over unchanged: Academic Teachers write only Subject Chapters, Books, Shlokas, Songs, and Prayers; Hostel Teachers/Wardens write only Skills and Services; each has view-only access to the other&apos;s categories. Administrator retains override rights on every category, and this check remains server-enforced (FR-1.6), matching the Attendance module&apos;s existing server-side role checks (P1).
3. Unified Platform Architecture
3.1 Product perspective
One deployable platform — a single backend, a single database, and a single responsive web/mobile front end — hosting two feature modules that both sit on the same core services. This replaces the Attendance document&apos;s implied standalone mobile-first app and the Progress Tracker&apos;s implied standalone self-hosted app.
3.2 Shared core services
Authentication & access control — one login per person (supporting both the phone-linked login the Attendance module assumes and the email/password login the Progress Tracker assumes), individual accounts only, server-enforced role and category checks, OTP-based password reset, and a single session-timeout policy (Section 8).
Student & staff roster with one bulk-import engine — one Student record and one Staff/Teacher record per person, edited from one Administrator screen and imported from one Excel/CSV pipeline (validation preview, row-level errors/warnings, downloadable template, duplicate detection) reused for student import, staff import, and — extended with the same pattern — the Progress Tracker&apos;s per-class entry upload.
Notification & messaging — one WhatsApp Business API / SMS / push integration, already required for Attendance&apos;s reminders, escalations and safety alerts, extended to also carry Progress Tracker action-item due-date reminders and Defaulter alerts on the management report — both explicitly out of scope for the standalone Progress Tracker, but low marginal cost once the channel exists for Attendance.
Reporting & export engine — one Excel/PDF export and A4 print-stylesheet component, shared by the Attendance module&apos;s proforma reports (R1–R6) and the Progress Tracker&apos;s completion matrix and management report (FR-9.x).
Audit log — one audit trail (who, what, when, before/after) covering roster edits, role changes, attendance corrections, and progress-entry overrides, instead of two separate logs.
Mobile / web delivery — one responsive web app, installable to a phone home screen and packaged as an Android APK, serving both modules. Offline-first caching and sync (required for Attendance marking, A5) is scoped only to the Attendance screens; Progress Tracker screens remain online-only, consistent with its explicit exclusion of offline entry.
4. Unified Data Model
Student and Staff are now single entities shared by both modules. Module-specific entities are unchanged from the source documents and simply reference the shared Student/Staff records instead of a module-local copy.
4.1 Student (merged — superset of both source schemas)
Field
Source
Notes
Admission No. (unique ID)
Attendance
Primary key; Progress Tracker&apos;s &quot;admission number&quot; maps to the same field
Student Name
Both
—
Class / Grade
Both
Attendance uses Grades 2–12; Progress Tracker uses 3–12 — unify to 2–12 and validate range on save
Section
Both
e.g. A / Krishna / Balram / Vedic
Student Type
Attendance
Residential / Day Scholar / Vedic School / Day Boarding
Hostel House
Both
Attendance: Govardhan/Vrindavan/Nandgaon/Barsana; used by Progress Tracker to route Hostel Teacher category access
Roll No.
Attendance
—
Year of Joining / Old-New flag
Attendance
—
Active flag, joining & leaving dates
Both
Deactivation (not deletion) keeps history; reversible
Photo (optional)
Attendance
Also useful for Progress Tracker&apos;s student profile screen
Parent contact (optional, phase 2)
Attendance
—
4.2 Staff / Teacher (merged — superset of both source schemas)
Field
Source
Notes
Name
Both
—
Role
Both
Teacher (Academic / Hostel / duty subtype), Coordinator, Administrator, Management — see Section 2
Phone
Attendance
Used for reminders and WhatsApp/SMS
Email
Progress Tracker
Used for login
Password (hashed, bcrypt)
Progress Tracker
Applies platform-wide
Subject (academic teachers) / Hostel house (hostel teachers)
Progress Tracker
Drives category-scoped access
Login credentials
Both
One login, not two
Active flag
Both
Deactivation flags pending attendance duties for reassignment and revokes access immediately
4.3 Module-specific entities
These remain as specified in the source documents and now reference the shared Student/Staff tables above.
Attendance module — Checkpoint, Duty Roster Entry, Attendance Record, Spanning Status, plus the Module F extensions: Gate Pass, Sick Bay Admission, Muster Plan/Event, Kitchen Headcount.
Progress Tracker module — Goal, Student Goal / Progress Entry (status, is_defaulter flag, remarks, updated-by/at, completed-at), Action Item, Teacher Assignment (grade or student).
Shared — Audit Log (Section 3.2) now covers entries from both modules in one table.
5. Module 1 — Attendance & Student Safety
Condensed from Attendance_System_Requirements_v1.docx Sections 5–13; full checkpoint list, status rules, and acceptance criteria in the source document carry over unchanged except where they reference the now-shared Student/Staff/roster/notification/reporting services in Section 3.
5.1 Core marking & rules
Eight status types (Present, Absent, Home, Sick, Activity, Outing, Gita Nagari, Self study); exception marking defaults every student to Present.
Spanning statuses (Home, Sick, Outing) pre-fill every checkpoint until cleared; teacher-initiated carry-forward with Coordinator confirmation.
Configurable checkpoints, time windows, and entry types — administered without developer involvement.
Day scholars auto-excluded from residential-only checkpoints; recurring rules for Activity/Self study.
5.2 Duty roster, reminders & escalation
Coordinator-managed duty roster with per-day overrides and recurring defaults; reassignment on staff deactivation.
Reminders 10 minutes before window close; escalation to Coordinator/MOD at close, to Principal 10 minutes later; mandatory-escalation checkpoints (breakfast/dinner prasadam, night) escalate to Principal immediately.
Automatic post-submission summaries to Coordinator, MOD and Principal via the shared notification channel (Section 3.2).
5.3 Safety cross-checks
Present-then-Absent same-day comparison triggers an immediate red alert.
End-of-window unverified sweep; night-attendance final reconciliation requiring active acknowledgment; alerts closed only with a logged remark.
5.4 Reports
Daily proforma-format exports (Excel/PDF), regularity report, needs-special-attention list, individual student ledger, monthly management pack — built on the shared reporting engine (Section 3.2).
5.5 Module F — safety & operations extensions
Extension
Core behaviour
Gate pass & outing
Request → approval sets Outing spanning status → QR gate pass → out/in time logged → automatic alert if not returned within grace period
Sick bay (nurse)
Admission sets Sick status automatically; per-admission clinical record; escalation on long/repeated admissions; feeds kitchen count
Emergency muster
One-tap trigger pushes roll-call to every staff phone; live accounted-vs-unverified board; target full accounting in under 5 minutes
Kitchen headcount
Automatic expected-meal counts by band, derived from spanning statuses and gate passes; counts only, no student data exposed to kitchen staff
6. Module 2 — Progress Tracker
Condensed from School_Progress_Tracker_SRS.docx Sections 3 and 6; full FR-ID list and priorities in the source document carry over unchanged except where they reference the now-shared roster/import/reporting services in Section 3.
6.1 Goals & progress entry
Seven learning-outcome categories: subject chapters, books, shlokas, songs, prayers, skills developed, services excelled.
Teachers define goals within their authorized category and assign to one or more students; duplicate assignment prevented.
Status per student-goal: Not Started / Started / Completed, with free-text remarks visible to any teacher viewing that student, and a completed-at date.
Independent Defaulter flag per entry, separate from status, so it does not distort completion-percentage reporting.
6.2 Class-wide entry upload & teacher assignment
Administrator bulk-loads a per-class Excel sheet (category + entry) that auto-creates/reuses goals and assigns them to every student in the grade — using the shared bulk-import pattern (Section 3.2).
Administrator assigns a teacher to a whole grade or a specific student; teachers can filter their own student list to their assignments.
6.3 Action items & reporting
Action items: description, optional student/grade link, responsible teacher, due date, status (Open/In Progress/Done); teachers see and update only their own, Administrator/Management sees and manages all.
Completion-percentage matrix by grade and category; below-threshold attention list; Defaulters list; A4-formatted printable management report — built on the shared reporting engine (Section 3.2).
6.4 Mobile access
Installable to phone home screen (PWA) and packaged as an Android APK, via the shared mobile/web delivery layer (Section 3.2); no offline entry (unchanged from source scope).
7. Redundancy Removed by Combining the Two Systems
This is the direct answer to “can we remove the redundancy” — each item below was a separate build in both source documents and is now a single shared component.
Previously duplicated
Now
Two student rosters, two Admission-No. schemes, two import flows
One Student master record, one Admission No., one import pipeline (Section 4.1)
Two staff directories, two sets of login credentials per person
One Staff/Teacher master record, one login and RBAC system (Section 4.2)
Two Administrator role definitions and two admin screens for roster management
One Administrator role, one roster/config admin area (Section 2)
Two audit logs
One audit log covering both modules (Section 3.2)
Two bulk-import/validation UIs (student/staff import in Attendance; student/teacher/class-entry import in Progress Tracker)
One reusable import-with-preview component used by all three imports (Section 3.2)
Attendance&apos;s WhatsApp/SMS integration, built new, alongside Progress Tracker&apos;s explicit “no automated notifications” scope
One notification channel; Progress Tracker gains action-item/Defaulter alerts at near-zero marginal cost (Section 3.2)
Two Excel/PDF export engines and two print-layout systems
One reporting/export engine serving both modules&apos; reports (Section 3.2)
Attendance&apos;s Android app track vs. Progress Tracker&apos;s separate PWA/APK track
One responsive PWA + APK delivery layer; offline caching scoped only where Attendance needs it (Section 3.2)
Two backends (Attendance: Postgres/Supabase/Firebase-class; Progress Tracker: self-hosted Node + embedded SQLite)
One backend and one database (recommendation and trade-off in Section 8)
8. Non-Functional Requirements (merged)
Area
Combined requirement
Source
Scale
Design for 800 students, 60 staff, 12 checkpoints/day, 3 academic years of attendance history, plus ~300–800 students&apos; worth of progress-tracker goals/entries, without degradation
Attendance Q1 (larger of the two — covers Progress Tracker&apos;s ~300/20–30 comfortably)
Availability
99% during 4:00 AM–10:30 PM IST; graceful offline behaviour for Attendance marking screens only
Attendance Q2
Security
Individual logins only; passwords bcrypt-hashed; all traffic HTTPS/TLS; database encrypted at rest; role and category checks server-enforced on every request
Both (Attendance P1–P2, Progress FR-1.6/5.2)
Session policy
Single platform-wide session timeout with OTP-based reset; confirm duration (Progress Tracker specifies 12h; Attendance does not specify — Section 9)
Progress Tracker 5.2, Attendance P5
Data protection
Compliance with India&apos;s DPDP Act 2023 (children&apos;s-data provisions); no third-party analytics/ads SDKs; no student data used beyond school operations — applies to both modules, including Module F health/movement data
Attendance P4
Backups
Automated daily backups, ≥30-day retention, documented and tested restore procedure; Indian data-centre region preferred — adopted platform-wide as the stricter of the two source policies
Attendance P3 (Progress Tracker only specified “hosting admin responsible for backups”)
Paper fallback
One-click printable blank register per Attendance checkpoint for outage days
Attendance Q3
Usability
Attendance: 40-student group marked in under 2 minutes. Progress Tracker: routine status update in ≤3 taps from a student&apos;s profile
Both
Languages
English at launch; Hindi optional phase 2
Attendance Q4
8.1 Backend & technology recommendation
The two documents propose different backends: Attendance suggests a client framework such as Flutter/React Native with a PostgreSQL/Supabase/Firebase backend, sized for real-time alerting and offline sync; Progress Tracker specifies a self-hosted Node.js + embedded SQLite single-process app, explicitly avoiding native dependencies. For one combined platform, recommend a single Node.js (or similar) backend on PostgreSQL: Postgres comfortably covers Progress Tracker&apos;s modest 300-student/20–30-staff load while providing the concurrency and reliability the Attendance module&apos;s real-time alerts and 8–10-checkpoints/day write volume need — SQLite alone would become a constraint once the two modules share one deployment. This is a recommendation for the developer to confirm, not a fixed decision (Section 9).
9. Open Decisions
9.1 New decisions created by merging
Confirm whether the two source documents describe the same school/student population, or two separate rosters that need reconciling (415 vs ~300 students; Grades 2–12 vs 3–12).
Confirm the role split in Section 2 — keeping Administrator and Management separate (Attendance&apos;s model) versus merging them into one “Admin/Management” role (Progress Tracker&apos;s model).
Confirm login identifier: phone-based (Attendance) vs email-based (Progress Tracker) — recommend supporting both per person.
Confirm session-timeout duration platform-wide (Progress Tracker specifies 12h; Attendance is silent).
Confirm backend/database choice (Section 8.1) with the development vendor.
Confirm whether to extend automated WhatsApp/SMS notifications to Progress Tracker action items and Defaulter flags, now that the channel exists for Attendance (previously out of scope for Progress Tracker alone).
Confirm combined phasing/milestones (Section 10) against the school&apos;s preferred rollout order.
9.2 Carried over from the source documents
Each source document&apos;s own open items (Attendance Section 16; not itemized separately here) still need answers — e.g. who may set spanning statuses, Vedic School residential treatment, Saturday/Sunday schedules, WhatsApp vs SMS as primary channel, night-attendance grouping, the muster plan itself, kitchen headcount delivery method, and parent OTP at gate pickup. These are unaffected by the merge and can be resolved on the Attendance module&apos;s original timeline.
10. Suggested Combined Milestones
Sequencing the shared core first lets both modules benefit from it immediately, and puts the safety-critical Attendance module ahead of Module F&apos;s operational extensions, consistent with the original Attendance phasing.
Milestone
Scope
M0 — Shared core (≈2 weeks)
Unified auth/RBAC, Student & Staff roster with bulk import, audit log, notification channel setup, reporting/export shell
M1 — Attendance pilot (≈3 weeks)
Teacher marking app on the shared core, seeded roster reused from M0, checkpoint summaries via the shared channel
M2 — Attendance full rollout (≈3 weeks)
Duty roster, reminders/escalation, safety cross-checks, spanning statuses, whole-school rollout
M3 — Attendance reporting (≈3 weeks)
Proforma reports, access control hardening, backups — on the shared reporting engine
M4 — Progress Tracker (≈4–5 weeks)
Goals, progress entry, class-wide upload, teacher assignment, action items, completion/Defaulter reporting — reusing M0&apos;s roster, import, and reporting components
M5 — Module F extensions (≈3–4 weeks)
Gate pass/outing, sick bay, emergency muster, kitchen headcount
Indicative only — total build effort is expected to be less than the sum of the two original quotations, since M0 replaces work both documents priced independently.
Appendix — Source Documents
Attendance_System_Requirements_v1.docx — “Attendance & Student Safety System,” Version 1.2 (Draft), 19 July 2026.
School_Progress_Tracker_SRS.docx — “School Progress Tracker: Academic & Hostel Learning Outcome Monitoring System,” Version 2.1, 19 July 2026.
Both source documents remain the authoritative reference for module-specific requirement IDs, acceptance criteria, and checkpoint/category detail not reproduced in full here.