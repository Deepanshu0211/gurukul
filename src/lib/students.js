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
});

export async function fetchStudents() {
  // Supabase caps a request at 1000 rows by default, which comfortably covers
  // the current register; range() is set explicitly so growth past that is a
  // deliberate change rather than a silent truncation.
  const { data, error } = await supabase
    .from("students")
    .select("admission_no,name,grade,section,stype,roll_no,remedial")
    .eq("active", true)
    .order("grade", { ascending: true })
    .order("roll_no", { ascending: true })
    .range(0, 999);

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
