// Pure formatting helpers. No app state, no data source — these survive the
// move from mock data to Supabase untouched.

/** "3 students" / "1 student" */
export const plural = (n, word, pluralForm) =>
  `${n} ${n === 1 ? word : pluralForm || word + "s"}`;

/** Minutes-from-midnight (the schema's start_min/end_min) -> "7:42 AM" */
export const fmtTime = (minutes) => {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = String(Math.abs(minutes) % 60).padStart(2, "0");
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
};

/** "Overdue by 12 min" / "Closes in 8 min" — relative beats absolute when
 *  the question is "do I have time?" */
export const fmtDuration = (minutes) => {
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
};

/**
 * Given name only, for greetings. School names carry honorifics
 * (Mt = Mataji, Pr = Prabhu) that shouldn't appear in a greeting, and some
 * accounts are role names like "MOD" with no personal name at all.
 */
export const givenName = (fullName) => {
  const name = (fullName || "").trim();
  if (!name) return "there";
  return name.split(/\s+/)[0];
};

/** Single uppercase initial for avatars, safe on empty/odd names. */
export const initial = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";

/** Percentage guarded against divide-by-zero. */
export const percent = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);

/** Today as the "YYYY-MM-DD" the `duties.day` column stores. Built from the
 *  local date parts, not toISOString(), which shifts the day in any timezone
 *  ahead of UTC — India is +5:30, so the naive version rolls over early. */
export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Parsed as local midnight, so a date-only string never lands on the day
 *  before in timezones behind UTC. */
const parseDay = (iso) => {
  const [y, m, d] = (iso || "").split("-").map(Number);
  return y ? new Date(y, m - 1, d) : null;
};

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-11" -> "Tuesday, 11 Aug". Today and yesterday get named instead. */
export const fmtDay = (iso) => {
  const d = parseDay(iso);
  if (!d) return "—";
  if (iso === todayISO()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]}`;
};

/** Two short lines for a date chip: { top: "FRI", bottom: "8 Aug" }. */
export const fmtDayChip = (iso) => {
  const d = parseDay(iso);
  if (!d) return { top: "—", bottom: "" };
  return {
    top: iso === todayISO() ? "TODAY" : WEEKDAY[d.getDay()].slice(0, 3).toUpperCase(),
    bottom: `${d.getDate()} ${MONTH[d.getMonth()]}`,
  };
};
