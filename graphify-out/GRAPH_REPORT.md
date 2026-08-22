# Graph Report - D:\Gurukul App Dev\gurukul  (2026-08-21)

## Corpus Check
- Large corpus: 109 files · ~776,941 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 537 nodes · 1345 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.8)
- Token cost: 148,837 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Shared UI Components|Shared UI Components]]
- [[_COMMUNITY_Duty and Alert Domain Rules|Duty and Alert Domain Rules]]
- [[_COMMUNITY_App Shell and Data Providers|App Shell and Data Providers]]
- [[_COMMUNITY_Hooks, Avatars and Error Handling|Hooks, Avatars and Error Handling]]
- [[_COMMUNITY_Original Web Prototype|Original Web Prototype]]
- [[_COMMUNITY_Expo Dependency Manifest|Expo Dependency Manifest]]
- [[_COMMUNITY_Mock Data and Register|Mock Data and Register]]
- [[_COMMUNITY_Android App Configuration|Android App Configuration]]
- [[_COMMUNITY_Student History and Formatting|Student History and Formatting]]
- [[_COMMUNITY_PDF Report Pipeline|PDF Report Pipeline]]
- [[_COMMUNITY_Architecture and Data Model Docs|Architecture and Data Model Docs]]
- [[_COMMUNITY_Project Planning and Stack Decisions|Project Planning and Stack Decisions]]
- [[_COMMUNITY_Status Vocabulary and Naming|Status Vocabulary and Naming]]
- [[_COMMUNITY_Checkpoints, Duties and Schema Gap|Checkpoints, Duties and Schema Gap]]
- [[_COMMUNITY_Platform Scope and Module F|Platform Scope and Module F]]
- [[_COMMUNITY_Safety Alerts and Escalation|Safety Alerts and Escalation]]
- [[_COMMUNITY_Roles and Access Control|Roles and Access Control]]
- [[_COMMUNITY_Marking and Records UX|Marking and Records UX]]
- [[_COMMUNITY_Theme Tokens and Shared UI|Theme Tokens and Shared UI]]
- [[_COMMUNITY_Student Register Import|Student Register Import]]
- [[_COMMUNITY_Reports and Printing|Reports and Printing]]
- [[_COMMUNITY_Audit Trail and Visibility|Audit Trail and Visibility]]
- [[_COMMUNITY_Android Insets and Theming|Android Insets and Theming]]

## God Nodes (most connected - your core abstractions)
1. `ClassDayScreen()` - 24 edges
2. `DashboardScreen()` - 22 edges
3. `colors` - 22 edges
4. `spacing` - 20 edges
5. `useAuth()` - 19 edges
6. `AccountScreen()` - 17 edges
7. `RosterScreen()` - 17 edges
8. `radius` - 17 edges
9. `layout` - 17 edges
10. `fonts` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Build Tracker — 15 Steps, UI First Then Backend` --semantically_similar_to--> `Remaining Build Order 5.1–5.9`  [INFERRED] [semantically similar]
  docs/dev-tracker.html → CLAUDE.md
- `Naming Cheat Sheet — Same Word for the Same Thing Everywhere` --semantically_similar_to--> `Established Identifier Names (students, duties, dutyStatus, STATUS_META, SPANNING, deriveAlerts)`  [INFERRED] [semantically similar]
  docs/dev-tracker.html → CLAUDE.md
- `Verify-Before-Trusting RLS Checklist (both directions, real token)` --semantically_similar_to--> `Verify Every RLS Policy Against a Real Token`  [INFERRED] [semantically similar]
  supabase/README.md → CLAUDE.md
- `BGIS Attendance — Attendance & Student Safety` --conceptually_related_to--> `Present-Then-Absent Safety Check (the reason the app exists)`  [INFERRED]
  README.md → CLAUDE.md
- `Established Identifier Names (students, duties, dutyStatus, STATUS_META, SPANNING, deriveAlerts)` --conceptually_related_to--> `Data Model — Nine Tables With Attendance at the Centre`  [INFERRED]
  CLAUDE.md → docs/reference/data-model.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Present-Then-Absent Safety Alert Flow** — claude_present_then_absent_check, docs_reference_attendance_requirements_safety_crosschecks, docs_reference_self_build_guide_send_summary, docs_architecture_derived_alerts, docs_reference_data_model_alert_resolutions [EXTRACTED 1.00]
- **Missed-Checkpoint Reminder and Escalation Ladder** — docs_reference_attendance_requirements_module_c, docs_reference_attendance_requirements_mandatory_escalation, docs_reference_self_build_guide_cron_reminders, docs_reference_self_build_guide_cron_generate_duties, docs_reference_data_model_schema_gap [INFERRED 0.85]
- **Row-Level Security Discipline Across the Project** — claude_rls_verification, supabase_readme_rls_verification_table, docs_architecture_upsert_select_policy, docs_reference_self_build_guide_rls_policies, docs_reference_attendance_requirements_access_control, docs_reference_data_model_audit_append_only [INFERRED 0.95]

## Communities (23 total, 1 thin omitted)

### Community 0 - "Shared UI Components"
Cohesion: 0.06
Nodes (63): BottomSheet(), SheetOption(), styles, CalendarSheet(), iso(), MONTHS, pad(), styles (+55 more)

### Community 1 - "Duty and Alert Domain Rules"
Cohesion: 0.09
Nodes (42): EdgeFade(), FADE, LOCATIONS, styles, FadeIn(), ALERT_KIND, deriveAlerts(), describeAlert() (+34 more)

### Community 2 - "App Shell and Data Providers"
Cohesion: 0.08
Nodes (35): App(), DialogProvider(), ToastProvider(), PrimaryButton(), AuthContext, AuthProvider(), SchoolDataContext, SchoolDataProvider() (+27 more)

### Community 3 - "Hooks, Avatars and Error Handling"
Cohesion: 0.12
Nodes (37): useDialog(), useScrolled(), useToast(), useAuth(), useSchoolData(), roleLabel(), compressToBase64(), ensurePermission() (+29 more)

### Community 4 - "Original Web Prototype"
Cohesion: 0.10
Nodes (40): AddStudent(), App(), bandOf(), BANDS, buildDuties(), buildSeeds(), carriedStatuses(), CLASS_TEACHERS (+32 more)

### Community 5 - "Expo Dependency Manifest"
Cohesion: 0.05
Nodes (39): dependencies, base64-arraybuffer, expo, expo-font, @expo-google-fonts/fraunces, @expo-google-fonts/google-sans, @expo-google-fonts/manrope, expo-haptics (+31 more)

### Community 6 - "Mock Data and Register"
Cohesion: 0.08
Nodes (30): EmptyState(), SectionLabel(), DUTIES, isRes(), labelOf(), RAW, secShort(), SEED_RECORDS (+22 more)

### Community 7 - "Android App Configuration"
Cohesion: 0.07
Nodes (26): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, backgroundColor, barStyle (+18 more)

### Community 8 - "Student History and Formatting"
Cohesion: 0.13
Nodes (20): Avatar(), STATUS_COLOR, styles, GreetingHeader(), ProgressBar(), styles, daysAgo(), RANGES (+12 more)

### Community 9 - "PDF Report Pipeline"
Cohesion: 0.21
Nodes (19): addDays(), buildReport(), printReport(), weekStart(), detail(), fetchAll(), fetchDayReport(), fetchRangeReport() (+11 more)

### Community 10 - "Architecture and Data Model Docs"
Cohesion: 0.14
Nodes (21): Remaining Build Order 5.1–5.9, Verify Every RLS Policy Against a Real Token, Data Flow: Supabase → lib → SchoolDataContext → domain → screens, React Native fetch() Returns an Empty ArrayBuffer for file:// URIs, Folder Map (screens, components, domain, utils, data, lib, context, navigation, theme), Data, Rules and Presentation Stay in Separate Folders, Supabase upsert Needs a SELECT Policy, Student Names Are Generated; Every Other Field Is Real Structure (+13 more)

### Community 11 - "Project Planning and Stack Decisions"
Cohesion: 0.21
Nodes (15): Read Expo v57 Versioned Docs Before Coding, Stack Divergence: Expo Instead of a Vite Web PWA, Gurukul — Attendance & Student Safety App, Role → Tabs Mapping (teacher/coordinator/management/admin/nurse), Build Tracker — 15 Steps, UI First Then Backend, Three Main Screen Options: Mark Attendance / Roster & People / Reports & Alerts, Build the UI on Dummy Data Before Any Backend Exists, gurukula-attendance-prototype.jsx (part of the specification) (+7 more)

### Community 12 - "Status Vocabulary and Naming"
Cohesion: 0.17
Nodes (13): Established Identifier Names (students, duties, dutyStatus, STATUS_META, SPANNING, deriveAlerts), Open Questions Reserved for the School, Status Codes Are Constants, Not Strings, Naming Trap: Computed UI Chip vs Stored duty_state Enum, Naming Cheat Sheet — Same Word for the Same Thing Everywhere, Configurable Entry Types Without Developer Involvement (S7), Spanning Status — Home/Sick/Outing Pre-Filling Later Checkpoints (S3, S4), Teacher-Initiated Provisional Carry-Forward (S8) (+5 more)

### Community 13 - "Checkpoints, Duties and Schema Gap"
Cohesion: 0.17
Nodes (12): Haptics Go Through lib/haptics.js with an On/Off Preference, Checkpoint (named attendance event with a daily time window), Duty (one checkpoint + one student group + one assigned marker for a day), Module B — Duty Roster (B1–B5), Student Group (class-section, grade band, residential variants, whole school, custom list), checkpoints Table (start_min / end_min as minutes from midnight), duties Table (staff_id, submitted_by, corrected_by, class_key/scope), Schema Gap: band and mandatory_escalation Read but Never Created (+4 more)

### Community 14 - "Platform Scope and Module F"
Cohesion: 0.20
Nodes (10): Out of Scope: Progress Tracker and Module F, SRS Milestones M1–M4 and Acceptance Criteria, Module F — Gate Pass, Sick Bay, Emergency Muster, Kitchen Headcount, Progress Tracker Module — Seven Learning-Outcome Categories, Redundancy Removed by Combining the Two Systems, Shared Core Services (auth, roster, notification, reporting, audit, delivery), Unified Data Model — One Student and One Staff Entity, Platform Objectives: One Roster, One Login, One Toolchain, One Experience (+2 more)

### Community 15 - "Safety Alerts and Escalation"
Cohesion: 0.27
Nodes (10): Present-Then-Absent Safety Check (the reason the app exists), Safety Alerts Are Derived, Not Stored, Mandatory-Escalation Checkpoints Go Straight to the Principal (C2), Module C — Reminders, Summaries and Escalation (N1–N5), Safety Cross-Checks F1–F4, alert_resolutions Table — Only the Human Part Persists, cron-night-reconciliation Edge Function, cron-reminders Edge Function (5-minute reminder and escalation ladder) (+2 more)

### Community 16 - "Roles and Access Control"
Cohesion: 0.25
Nodes (8): Access Control and Data Protection (P1–P5, DPDP Act 2023), Four Roles: Teacher, Coordinator, Management, Administrator, Platform-Wide Role Structure Adopted From the Attendance Model, staff Table (auth_user_id keys every RLS policy; role/email pinned by WITH CHECK), Illustrative Core RLS Policies and my_staff() Helper, Use the anon Key — service_role Never in App or Repo, Mumbai Region for Latency and In-Country Data, seed.sql — Status Types, Checkpoints, Staff, Pilot Duties and Auth Linking

### Community 17 - "Marking and Records UX"
Cohesion: 0.29
Nodes (7): Long Lists Are Memoised and Windowed (studentsForDuty cached per duty), Exception Marking — Everyone Defaults to Present (S1), Module A — Teacher Mobile App (A1–A9), Non-Functional Requirements Q1–Q5 (scale, availability, paper fallback), Goals & Standards: Scale, Availability, Trust, Backups, Usability, Oversight Overrule of a Submitted Record (SRS A6), Records — Reading Any Past Day Back

### Community 18 - "Theme Tokens and Shared UI"
Cohesion: 0.50
Nodes (4): Weights Set via fontFamily, Not fontWeight, Shared UI Is Shared, Not Copied (ui.js, BottomSheet, ScreenHeader), One Token for One Decision (theme/theme.js), Every Write Confirms Itself — Toast on Success, Dialog on Failure

### Community 19 - "Student Register Import"
Cohesion: 0.67
Nodes (4): Swapping the Real Register Back In Before the Pilot, Module E — Student & Staff Administration (D1–D6), Student_List_2025-26.xlsx — Authoritative Register and Import Format, import_students.py — Re-Runnable One-Time Student Import

### Community 20 - "Reports and Printing"
Cohesion: 0.50
Nodes (4): Module D — Reports (R1–R6), SCHOOL_ATTENDANCE_REPORT_2025.xlsx — Paper Proforma Layouts, expo run:android Is Not Optional (native expo-print code), A4 Printing via expo-print

### Community 21 - "Audit Trail and Visibility"
Cohesion: 0.50
Nodes (4): No Insert Policy on audit_log; Entries Arrive via SECURITY DEFINER Triggers, audit_log Table — Append-Only Action Record, Three-Tier Audit Log Visibility (admin / oversight / own entries), Audit Trail Written by Database Triggers, Not the App

## Knowledge Gaps
- **153 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+148 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fmtTime()` connect `Duty and Alert Domain Rules` to `Shared UI Components`, `Hooks, Avatars and Error Handling`, `Mock Data and Register`, `Student History and Formatting`, `PDF Report Pipeline`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `colors` connect `Shared UI Components` to `Duty and Alert Domain Rules`, `App Shell and Data Providers`, `Hooks, Avatars and Error Handling`, `Mock Data and Register`, `Student History and Formatting`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Attendance & Student Safety System SRS v1.2` connect `Project Planning and Stack Decisions` to `Architecture and Data Model Docs`, `Status Vocabulary and Naming`, `Platform Scope and Module F`, `Student Register Import`, `Reports and Printing`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _172 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shared UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05811965811965812 - nodes in this community are weakly interconnected._
- **Should `Duty and Alert Domain Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.08653061224489796 - nodes in this community are weakly interconnected._
- **Should `App Shell and Data Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.08233117483811286 - nodes in this community are weakly interconnected._