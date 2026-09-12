-- 023 — "Today" means today in Vrindavan, not today in UTC.
--
-- THE BUG
-- The database runs in UTC. India is UTC+5:30. So between midnight and 5:30am
-- IST, `current_date` on the server is YESTERDAY:
--
--   04:30 IST on 13 Sep  ->  23:00 UTC on 12 Sep  ->  current_date = 12 Sep
--
-- The app computes its own date from the phone's clock (`todayISO()` in
-- src/utils/format.js, which deliberately avoids toISOString() for exactly this
-- reason) and asks for `duties.day = '2026-09-13'`. The server, inserting with
-- `default current_date`, stamped those duties 2026-09-12. They never match.
--
-- WHY IT MATTERS HERE MORE THAN ELSEWHERE
-- Mangalarati is at 4:30 in the morning. It is the first checkpoint of the
-- school's day and it sits squarely inside the broken window. So does anything
-- a cron job does overnight — including the nightly duty generation that
-- seed.sql says is coming. The one checkpoint most likely to be created and
-- marked in the dark is the one guaranteed to get the wrong date.
--
-- It is invisible in testing. Every hour anyone would naturally test in — the
-- working day — the two dates agree.
--
-- THE FIX, TWICE
-- 1. Set the database's timezone, so `current_date` means what everyone
--    writing SQL against it already assumes it means.
-- 2. Give the duty table an explicit default that does not depend on that
--    setting, because a school's register should not quietly change meaning if
--    someone flips a cluster setting back.
--
-- Stored timestamps are NOT affected. `timestamptz` columns hold an absolute
-- instant; this changes how a date is derived and how times are rendered,
-- never what was recorded.

-- ── 1. THE CLUSTER'S IDEA OF TODAY ──────────────────────────────────────────
-- Applies to connections opened after this runs, so existing sessions keep the
-- old setting until they reconnect. Harmless: the explicit default below is
-- what the duty rows actually rely on.
alter database postgres set timezone to 'Asia/Kolkata';

-- ── 2. THE SCHOOL'S OWN TODAY ───────────────────────────────────────────────
-- Named, so a reader of `duties.day` can see which "today" is meant without
-- knowing the server's configuration. Asia/Kolkata rather than a fixed +05:30
-- so it stays correct if India ever adopts daylight saving.
create or replace function school_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

grant execute on function school_today() to authenticated, anon;

comment on function school_today() is
  'The current date at the school. Use instead of current_date for anything a '
  'human would call "today" — before 5:30am IST they are different days.';

alter table duties alter column day set default school_today();

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   select current_setting('TIMEZONE');            -- 'Asia/Kolkata' on a NEW session
--   select current_date, school_today();           -- equal once reconnected
--
-- The case that was broken, checked without waiting until 4am:
--   select (timestamp '2026-09-13 04:30' at time zone 'Asia/Kolkata'
--             at time zone 'UTC')::date  as utc_would_say,
--          date '2026-09-13'             as the_school_would_say;
--   -> 2026-09-12 | 2026-09-13   — the day apart this migration removes.
--
-- STILL TO DO IN THE APP
-- `todayISO()` reads the PHONE's clock. A device with the wrong timezone set
-- still disagrees with the server. That is a smaller problem — one phone
-- rather than the whole school — but it is the same bug, and the duty list
-- simply looking empty is a poor way to report it.
