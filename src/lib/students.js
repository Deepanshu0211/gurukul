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

const secShort = (sec) => (sec === "A" ? "A" : sec === "Vedic" ? "Vedic" : sec[0]);

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

export async function fetchStudents() {
  // Supabase caps a request at 1000 rows by default, which comfortably covers
  // the current register; range() is set explicitly so growth past that is a
  // deliberate change rather than a silent truncation.
  const query = (columns) =>
    supabase
      .from("students")
      .select(columns)
      .eq("active", true)
      .order("grade", { ascending: true })
      .order("roll_no", { ascending: true })
      .range(0, 999);

  // `house` arrived with the Saturday assembly sheet (migration 017) and is
  // read in exactly one dialog. This function is loaded by every screen in the
  // app, so asking for it unconditionally meant that on a server where 017 has
  // not been run yet, PostgREST rejected the whole select and Duties — the
  // reason this app exists — went down for a label on a report. Ask for it,
  // and drop it if the server is behind.
  let { data, error } = await query(`${CORE},house`);
  if (error && missingColumn(error)) ({ data, error } = await query(CORE));

  if (error) throw error;
  return (data || []).map(fromRow);
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
