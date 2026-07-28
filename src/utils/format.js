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
