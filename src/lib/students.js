import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// The database stores student type as a readable label; the app's UI code
// works in the short codes the original register used. Keep the translation
// in one place so screens never deal with both spellings.
const TYPE_CODE = {
  Residential: "R",
  "Day Scholar": "D",
  "Vedic School": "V",
  "Day Boarding": "B",
};

// `sec[0]` on a row whose section is null or empty throws, and it throws
// inside the map over the whole register — so one malformed import row takes
// down every screen in the app rather than showing one student oddly.
const secShort = (sec) => {
  if (!sec) return "—";
  if (sec === "A" || sec === "Vedic") return sec;
  return sec[0];
};

export const fromRow = (r) => ({
  id: r.admission_no,
  adm: r.admission_no,
  name: r.name,
  grade: r.grade,
  sec: r.section,
  key: `${r.grade}|${r.section}`,
  label: `${r.grade} ${secShort(r.section)}`,
  type: TYPE_CODE[r.stype] || "D",
  roll: r.roll_no,
  remedial: !!r.remedial,
  // Null until the school supplies the house list (migration 017). The
  // Saturday assembly sheet groups by this; nothing else depends on it.
  house: r.house || null,
});

/** Everything the app cannot run without. */
const CORE = "admission_no,name,grade,section,stype,roll_no,remedial";

/**
 * Postgres's undefined_column, which is what PostgREST returns for a select
 * naming a column no migration has created yet. Distinct from the PGRST204
 * that `isNotDeployed` knows about — that one is only raised for writes.
 */
const missingColumn = (e) => e?.code === "42703" || /does not exist/i.test(e?.message || "");

const PAGE = 1000;

export async function fetchStudents() {
  // PostgREST answers with at most 1000 rows unless a range is given, so this
  // pages until the register runs out.
  //
  // It used to ask for `.range(0, 999)` once, with a comment arguing that a
  // fixed range made growth past a thousand "a deliberate change rather than a
  // silent truncation". It did not: nothing anywhere checked whether the
  // thousandth row was the last one. The register is 411 today and the
  // requirements say to plan for 800, so the school would have crossed it by
  // adding one campus, and the app would have shown a register missing its
  // last classes with nothing to say so. The same shape of bug cost this
  // project a day in `fetchDayAttendance`, where the rows that vanished were
  // the absences.
  const query = (columns, from) =>
    supabase
      .from("students")
      .select(columns)
      .eq("active", true)
      .order("grade", { ascending: true })
      .order("roll_no", { ascending: true })
      // admission_no last so the order is total. grade+roll_no is not unique —
      // two children can share a roll number across sections — and a tie the
      // database breaks differently between calls would repeat one row on a
      // page boundary and drop another.
      .order("admission_no", { ascending: true })
      .range(from, from + PAGE - 1);

  // `house` arrived with the Saturday assembly sheet (migration 017) and is
  // read in exactly one dialog. This function is loaded by every screen in the
  // app, so asking for it unconditionally meant that on a server where 017 has
  // not been run yet, PostgREST rejected the whole select and Duties — the
  // reason this app exists — went down for a label on a report. Ask for it,
  // and drop it if the server is behind. Decided once, on the first page,
  // rather than re-tried on every one.
  let columns = `${CORE},house`;
  const out = [];

  for (let from = 0; ; from += PAGE) {
    let { data, error } = await query(columns, from);
    if (error && missingColumn(error) && columns !== CORE) {
      columns = CORE;
      ({ data, error } = await query(columns, from));
    }
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }

  return out.map(fromRow);
}

export function useStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchStudents()
      .then(setStudents)
      .catch((e) => setError(e.message || "Could not load students"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return { students, loading, error, reload: load };
}
