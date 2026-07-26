--- slide1.xml ---
DEVELOPER BRIEFING
Unified School
Management Platform
One platform for daily attendance, student safety, and academic &amp; hostel progress tracking.
Version 0.1 (Draft)  ·  19 July 2026
Prepared for the development team — a walkthrough of platform functionality, configuration options, objectives and goals.

--- slide2.xml ---
1 · OBJECTIVES
What this platform is built to do
The platform serves one school community — the same students, teaching &amp; hostel staff, administrators and management — through a single, connected system for daily attendance, safety, and academic &amp; hostel progress.
01
One roster
A single student &amp; staff record, used everywhere in the platform.
02
One login
One set of credentials, with the right access for each person&apos;s role.
03
One toolchain
One place for notifications, reports, and audit history.
04
One experience
A single app that covers daily attendance, safety, and academic &amp; hostel progress tracking.
02

--- slide3.xml ---
2 · PLATFORM OVERVIEW
What the platform covers
DAILY OPERATIONS
Attendance &amp; Safety
Digital marking at 8–10 daily checkpoints
Duty rosters + spanning statuses (Home/Sick/Outing)
Reminders, escalation, real-time safety cross-checks
Gate pass · sick bay · muster · kitchen headcount
LEARNING &amp; GROWTH
Progress Tracking
7 learning-outcome categories (chapters → services)
Goal-based tracking, status &amp; remarks per student
Teacher-to-student assignment by category
Completion &amp; defaulter reporting for management
UNDERLYING PLATFORM
Platform Foundation
One login and role system, one roster, one import
One notification channel (WhatsApp/SMS/push)
One reporting/export engine + audit log
One responsive web app + Android APK
03

--- slide4.xml ---
3 · USERS &amp; ACCESS
One set of roles, used everywhere
Four roles apply across the whole platform, separating day-to-day data entry (Teacher, Coordinator) from oversight (Management, Administrator) — with teachers scoped to the categories they&apos;re authorized for.
Role
Typical people
Attendance &amp; Safety
Progress Tracking
Teacher / duty staff
Class, subject, hostel &amp; ashram staff
Mark assigned duty groups; view own history
Edit within authorized category only; view assigned students
Coordinator
Ashram Coordinator, MOD, academic coord.
Edit roster, reassign duties, backup-mark
Base Teacher rights only (unless also teaching)
Management
Principal, school leadership
Read-only dashboard, alerts, reports
Completion/defaulter reports; create action items
Administrator
Office administrator
Manage roster, logins, checkpoints
Bulk-load entries; override any goal/entry
04

--- slide5.xml ---
4 · PLATFORM FOUNDATION
What every part of the platform runs on
One backend, one database, one responsive web/mobile app — the same foundation supports attendance, safety, and progress tracking alike.
Authentication &amp; access control
One login (phone or email), role-based checks, OTP password reset, one session-timeout policy.
Student &amp; staff roster + bulk import
One record per person; one Excel/CSV pipeline with validation preview, row-level errors, duplicate detection.
Notification &amp; messaging
One WhatsApp/SMS/push channel carries every attendance alert, action-item reminder and defaulter notice.
Reporting &amp; export engine
One Excel/PDF export and A4 print stylesheet powers every report across the platform.
Audit log
One trail (who/what/when/before-after) covering every roster edit, role change, and correction.
Mobile / web delivery
One responsive app, installable to a phone home screen and packaged as an Android APK.
05

--- slide6.xml ---
5 · ATTENDANCE &amp; SAFETY
Core marking, duty roster &amp; escalation
8 status types
Present, Absent, Home, Sick, Activity, Outing, Gita Nagari, Self study. Exception marking defaults every student to Present.
Spanning statuses
Home / Sick / Outing pre-fill every checkpoint until cleared; teacher-initiated carry-forward with Coordinator confirmation.
Configurable checkpoints
Checkpoints, time windows and entry types administered without developer involvement.
Duty roster
Coordinator-managed, with per-day overrides, recurring defaults, and auto-reassignment on staff deactivation.
Reminders &amp; escalation
Reminder 10 min before window close → escalate to Coordinator/MOD at close → Principal 10 min later. Meal &amp; night checkpoints escalate to Principal immediately.
Post-submission summaries
Automatic summaries to Coordinator, MOD and Principal via the notification channel.
06

--- slide7.xml ---
5 · ATTENDANCE &amp; SAFETY
Safety cross-checks &amp; operational extensions
!
Safety cross-checks:  
Present-then-Absent same-day comparison triggers an immediate red alert. End-of-window unverified sweep and a night-attendance final reconciliation require active acknowledgment — alerts close only with a logged remark.
OPERATIONAL EXTENSIONS
Gate pass &amp; outing
Request → approval sets Outing status → QR pass → in/out time logged → auto alert if not returned within grace period.
Sick bay (nurse)
Admission auto-sets Sick status; per-admission clinical record; escalation on long/repeated admissions; feeds kitchen count.
Emergency muster
One-tap trigger pushes roll-call to every staff phone; live accounted-vs-unverified board; target &lt; 5 min full accounting.
Kitchen headcount
Automatic expected-meal counts by band, derived from statuses &amp; gate passes; counts only — no student data shown to kitchen.
07

--- slide8.xml ---
6 · PROGRESS TRACKING
Goal-based progress tracking, seven categories
Subject Chapters
Books
Shlokas
Songs
Prayers
Skills Developed
Services Excelled
Academic Teachers write the first 5 categories; Hostel Teachers/Wardens write Skills &amp; Services — enforced automatically by role.
Goals &amp; assignment:  
Teachers define goals within their authorized category and assign to one or more students; duplicate assignment prevented.
Status per student-goal:  
Not Started / Started / Completed, with free-text remarks visible to any teacher viewing that student, plus a completed-at date.
Independent defaulter flag:  
Separate from status, so a defaulter mark never distorts completion-percentage reporting.
Class-wide upload:  
Administrator bulk-loads a per-class Excel sheet (category + entry) that auto-creates/reuses goals for every student in the grade.
Teacher assignment:  
Administrator assigns a teacher to a whole grade or a specific student; teachers filter their list to their own assignments.
08

--- slide9.xml ---
6 · PROGRESS TRACKING
Action items, reporting &amp; mobile access
Action Items
Description + optional student/grade link
Responsible teacher · Due date
Status: Open / In Progress / Done
Teachers see &amp; update only their own
Administrator/Management sees &amp; manages all
Reporting
Completion-percentage matrix by grade &amp; category · below-threshold attention list · Defaulters list · A4 printable management report.
Mobile Access
Installable to a phone home screen (PWA) and packaged as an Android APK. No offline entry — progress updates need a connection (daily attendance marking is the only offline-capable area).
09

--- slide10.xml ---
7 · GOALS &amp; STANDARDS
What &quot;done&quot; looks like: scale, reliability, trust
Scale
Comfortably supports 800 students, 60 staff, 12 daily checkpoints, and 3 years of history — without slowing down.
Availability
Available through the school day (4:00 AM–10:30 PM IST); attendance marking keeps working even with a patchy connection.
Trust &amp; privacy
Only registered individuals can log in; every person&apos;s data is protected and used solely for school operations — no outside advertising or analytics access.
Session policy
One consistent sign-in timeout across the whole platform, with a simple self-service way to reset access.
Data protection
Meets India&apos;s DPDP Act 2023 requirements for children&apos;s data.
Backups
Daily backups kept for at least 30 days, with a tested way to restore if something goes wrong.
Usability
A 40-student group can be marked in under 2 minutes; a routine progress update takes 3 taps or fewer.
Languages
English at launch; Hindi as an optional next phase.
10

--- slide11.xml ---
8 · OPEN DECISIONS
Decisions to confirm before / during build
1
Same overall student population, or two rosters to reconcile? (415 vs ~300 students; Grades 2–12 vs 3–12)
2
Role split: keep Administrator &amp; Management separate, or one combined Admin/Management role?
3
Login identifier: phone-based, email-based, or support both per person?
4
Session-timeout duration platform-wide — confirm the standard to use.
5
Extend WhatsApp/SMS notifications to Progress Tracking action items &amp; defaulter flags?
6
Rollout order and phasing across the different feature areas.
Some items are specific to one feature area (e.g. spanning-status permissions, Saturday/Sunday schedules, WhatsApp vs SMS, night-attendance grouping, kitchen headcount delivery, parent OTP at gate pickup) and can be resolved on their own timeline.
11