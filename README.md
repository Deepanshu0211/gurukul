# Gurukul — Attendance & Student Safety App

Digital attendance for Bhaktivedanta Gurukula: teachers mark ~415 students at
8–10 daily checkpoints in under 2 minutes each, and the system automatically
catches a child who was present earlier in the day and goes unaccounted for later.

## Start here

If you're a developer (human or AI) picking this up: **read [`CLAUDE.md`](./CLAUDE.md) first.**
It's the complete build spec — what's already built, exact naming to use, the
database schema, and what's left to do, in priority order. This README is just
the quick-start.

## Run it

```bash
npm install
npm run start      # Expo dev server — scan the QR with Expo Go, or press w for web
```

## What's here

```
src/
  screens/         # Login, Duties, DutyMarking, Dashboard, Roster, Account
  navigation/       # role-based tab routing
  context/          # Auth + Attendance state (currently mock/in-memory)
  data/mockData.js  # hardcoded students/duties/alerts — being replaced by Supabase
  theme/, components/ui.js

docs/
  reference/        # original requirements docs + the web prototype this was ported from
  data/students_415.csv   # the real student register, for the import step
  dev-tracker.html  # open in a browser — build checklist with progress tracking
```

## Status right now

UI scaffold with mock data is in place (login, navigation, all main screens).
**No backend yet** — nothing is saved for real, no emails go out, the safety
alert doesn't run. That's the next phase — see `CLAUDE.md` §5.
