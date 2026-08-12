# Architecture

How this app is organised and where new code should go. Read this before
adding a screen or a feature.

## The one rule

**Data, rules, and presentation stay in separate folders.** The app currently
runs on mock data and will move to Supabase. If business rules live inside
screen components, that migration means rewriting every screen. Kept apart,
it means swapping one folder.

```
UI (screens/, components/)
      ↓ calls
Rules (domain/, utils/)          ← pure functions, no data source, no React
      ↓ operates on
Data  (data/mockData.js  →  lib/*.js Supabase queries)
```

## Folder map

| Folder | Holds | Rule of thumb |
|---|---|---|
| `screens/` | One file per screen. Layout and local UI state. | If it isn't rendering, it doesn't belong here. |
| `components/` | Reusable UI shared by 2+ screens. | Used once? Keep it in the screen file. |
| `domain/` | Business rules from the SRS — duty status, escalation, tallies. | Pure functions. No React, no imports from `data/` or `lib/`. |
| `utils/` | Generic helpers — date/number/string formatting. | Nothing app-specific. `fmtTime` yes, `dutyStatus` no. |
| `data/` | Mock data only. **Temporary.** | Being replaced by `lib/`. Don't add logic here. |
| `lib/` | Supabase client and real data access. | One file per table/concern. Returns app-shaped objects. |
| `context/` | Cross-screen React state (auth, attendance). | Only for state genuinely needed app-wide. |
| `navigation/` | Navigator, role→tabs mapping, and the tab bar. | |
| `../supabase/` | Migrations, seed, and rebuild instructions. | Never edit an applied migration — add the next numbered file. |
| `theme/` | Colours, spacing, fonts, type scale. | **Every** colour and font comes from here. |
| `assets/` | Images bundled into the app. | Everything here ships in the APK — keep it lean. |

Also present: `src/imgs/` and `src/vdos/` are local working folders for
source art. They are gitignored and never bundled.

## Conventions

**Colours and fonts come from the theme, never hard-coded.** `colors.danger`,
not `"#B91C1C"`. One exception is documented in `theme.js`: the login screen
uses `loginFonts` because its design was signed off before the rest of the
app standardised on Google Sans.

**Weights are set via `fontFamily`, not `fontWeight`.** With custom fonts,
`fontWeight: "700"` silently does nothing on Android. Use `fonts.bold`.

**Domain functions take their inputs explicitly.** `dutyStatus(duty, records, now)`
rather than reading a global clock, so it can be tested and so the simulated
`NOW` can become real time without touching call sites.

**Status codes are constants, not strings.** Compare against `DUTY_STATUS.DONE`,
not `"done"` — a typo in a string is silent, a typo in a constant is an error.

**One token for one decision.** `theme/theme.js` is the only place a colour,
size, radius, shadow or text style is chosen:

| Need | Use | Never |
|---|---|---|
| Page side padding | `layout.gutter` | a per-screen number |
| Gap under the status bar | `layout.screenTop` | letting the safe-area inset be the whole gap |
| Shadow | `shadow.sm \| md \| lg` | `elevation` — see the note in `theme.js` |
| Any margin/padding/gap | `spacing.xs…xl` (4/8/16/24/32) | 7, 9, 11, 13 |
| Text | a `typography.*` role | a bare `fontSize` |
| Card / row background | `surface.card \| raised \| sunken` | a fresh `rgba(255,255,255,…)` |
| Chevrons, counts, grips | `colors.icon` | `colors.border` (invisible on white) |
| Tap target | `minHeight: layout.touch` (44) | a padding that happens to land near it |
| Digits that change | `...numeric` | nothing — the row shifts as they tick |

**Shared UI is shared, not copied.** `components/ui.js` owns `Card`, `Pill`,
`SectionLabel`, `Divider`, `Chevron`, `Stat`, `EmptyState` and the buttons;
`components/BottomSheet.js` is the only bottom sheet; `components/ScreenHeader.js`
is the only page title. Six hand-rolled copies of the same card and four
hand-rolled sheets are what made the app read as "almost aligned".

**Every write confirms itself.** A successful save shows a toast
(`useToast().show(...)`); a failure shows a dialog (`useDialog().alert(...)`).
Never the reverse — a modal after a successful submit is a tap for nothing, and
a silent failure is worse than a loud one. Rows use `<Row>` from `ui.js`, which
dims and ripples on press.

**Long lists are memoised and windowed.** `studentsForDuty` is cached per duty
in `SchoolDataContext` because group resolution walks all 415 students; row
components are `React.memo` with stable handler identities; fixed-height rows
get `getItemLayout`. Never call `studentsForDuty` inside a `renderItem`.

**Dividers take an `inset` equal to what leads the row** (padding + icon/avatar
width + gap). A divider that starts at a different x than the text above it
reads as a wobble down the whole group.

**Insets come from hooks, not constants** — `useScreenTopInset()` at the top,
`useTabContentInset()` at the bottom (`navigation/tabBarInset.js`). Screens do
NOT wrap in `SafeAreaView edges={["top"]}`: content scrolls behind the status
bar and `<EdgeFade>` softens the boundary, so rows dissolve rather than being
sliced. Render `EdgeFade` *after* the scrolling view — siblings paint in order.

**The Android theme is `Theme.AppCompat.Light`, not DayNight.** The app is
light-only (`userInterfaceStyle: "light"`); leaving the native theme on
DayNight meant a phone in dark mode got a black window background behind the
transparent status bar. See `android/app/src/main/res/values/styles.xml`.

**Guard the edges.** Lists get `ListEmptyComponent`, async work gets loading
and error states, text that can be long gets `numberOfLines`, and anything
dividing by a count gets a zero check (see `utils/format.js → percent`).

**Haptics go through `lib/haptics.js`, never `expo-haptics` directly.** The
wrapper respects the user's on/off preference and swallows failures on devices
without a vibration motor. Keep them on meaningful moments — marking absent,
submitting, changing tab — not on every interaction, or the taps that matter
stop standing out. The preference exists because Mangalarati (4:30 AM) and
night attendance (9:15 PM) happen in dormitories, where 40 buzzes near
sleeping children is a real problem.

## Where things live

| Looking for | File |
|---|---|
| Duty status / escalation / tallies | `domain/duties.js` |
| Safety alerts (SRS F1) | `domain/alerts.js` |
| Duties, group resolution, submission | `lib/duties.js` |
| Past days (class history, SRS A8) | `lib/history.js` |
| Shared students/duties/attendance state | `context/SchoolDataContext.js` |
| Time, pluralisation, name formatting | `utils/format.js` |
| Supabase client and session config | `lib/supabase.js` |
| Haptic feedback + its on/off preference | `lib/haptics.js` |
| Student register queries | `lib/students.js` |
| Staff row mapping + profile updates | `lib/staff.js` |
| Profile photo pick / upload / remove | `lib/avatars.js` |
| Styled dialogs (replaces `Alert.alert`) | `components/Dialog.js` |
| Avatar with photo + initial fallback | `components/Avatar.js` |
| Duties greeting card | `components/GreetingHeader.js` |
| Page header used by other tabs | `components/ScreenHeader.js` |
| Which roles see which tabs | `navigation/RootNavigator.js` |
| The tab bar itself | `navigation/AppTabBar.js` |
| Bottom padding so content clears the tab bar | `navigation/tabBarInset.js` |
| Database schema, policies, seed | `../supabase/` (see its README) |
| Colours, spacing, fonts | `theme/theme.js` |

## Two things that will bite you

**React Native's `fetch()` returns an EMPTY ArrayBuffer for `file://` URIs.**
Uploading that way appears to succeed and silently writes a 0-byte object to
storage. Read the bytes as base64 and decode them instead — see
`lib/avatars.js`. Any future file upload must do the same.

**Supabase `upsert` needs a SELECT policy.** It compiles to
`INSERT ... ON CONFLICT`, which has to read whether a conflicting row exists.
Dropping the SELECT policy on `storage.objects` makes every upload fail with
"new row violates row-level security policy", even when the bucket is empty.
The policy is scoped to the user's own folder so it satisfies upsert without
letting anyone enumerate the bucket.

## Current state

**Real (Supabase):** authentication and session persistence, staff records,
profile phone and photo, the 415-student register, duties, and attendance.
Marking a duty writes to the `attendance` table and locks the duty;
reassigning writes to `duties`. Every screen reads through
`SchoolDataContext`, so a coordinator's change is visible to the teacher.

**Derived, not stored:** safety alerts. `domain/alerts.js` walks the day's
submitted attendance and reports each absent student, separating "was seen
earlier today" from "not seen at all yet". Deriving them means an alert can
never disagree with the attendance it came from.

**Still mock (`data/mockData.js`):** `NOW` (a simulated 7:42 AM clock),
`STATUS_META`, `STAFF` and `ROLE_LABELS`. Alert *resolutions* are local React
state and are lost on restart — there is no `alerts` table yet, and SRS F4
requires the remark to persist and be audit-logged before the pilot.

The backend work remaining is listed in `CLAUDE.md` §5.

## Data flow

```
Supabase ──> lib/*.js (queries, row mapping)
                ↓
       SchoolDataContext (one copy, shared)
                ↓
   domain/*.js (rules applied to plain objects)
                ↓
            screens
```

Screens never query Supabase directly. Anything fetching or writing goes in
`lib/`, so a schema change touches one file rather than five screens.

Lists reload on focus (`useFocusEffect`) and support pull-to-refresh. That is
enough for changes to propagate between roles within a session; live push
across two devices at once would need Supabase Realtime, which is not wired
up yet.

## Supabase setup

Captured as migrations in `supabase/` — see `supabase/README.md` for how to
rebuild a project from scratch and how to make schema changes safely.

- `staff` — added `auth_user_id`, `phone`, `photo_url`. RLS lets a user update
  their **own** row, with a `WITH CHECK` clause pinning `role` and `email` to
  their current values. Without that clause a teacher could set themselves to
  `admin` in the same statement that changes their phone number.
- `students`, `duties`, `attendance`, `checkpoints` — read for any signed-in
  user; writes scoped by role (see `CLAUDE.md` §5.2).
- Storage bucket `avatars` — public, 2 MB limit, images only. Four policies,
  each scoped to `(storage.foldername(name))[1] = auth.uid()::text`, so a user
  can only read, write, update and delete inside their own folder.

## Adding a screen

1. Create `screens/YourScreen.js`.
2. Register it in `navigation/RootNavigator.js` under the roles that should see it.
3. Use `<ScreenHeader>` for the title block.
4. Pull colours/spacing/fonts from `theme`.
5. Put any rule more complex than a filter into `domain/`, not the component.
