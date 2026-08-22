import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { todayISO } from "../utils/format";

/**
 * One student's attendance across a date range.
 *
 * Both calls go to functions defined in migrations/009 rather than being
 * assembled here. The join behind them is four tables deep and every report
 * needs the same one; written per-caller it comes out subtly different each
 * time, which is how two views of the same child end up disagreeing. They run
 * `security invoker`, so RLS still applies — this moves the SQL, not the
 * permissions.
 */

/** N days back from today, as the "YYYY-MM-DD" the `day` column stores. */
export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const RANGES = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
  { key: 90, label: "Term" },
];

export function useStudentHistory(admissionNo, days = 30) {
  const [state, setState] = useState({
    marks: [],
    summary: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!admissionNo) {
      setState({ marks: [], summary: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const args = { p_admission: admissionNo, p_from: daysAgo(days), p_to: todayISO() };

    Promise.all([
      supabase.rpc("student_attendance", args),
      supabase.rpc("student_attendance_summary", args),
    ])
      .then(([marks, summary]) => {
        if (cancelled) return;
        if (marks.error) throw new Error(marks.error.message);
        if (summary.error) throw new Error(summary.error.message);
        setState({
          marks: marks.data || [],
          // The summary function returns a single row.
          summary: (summary.data || [])[0] || null,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setState({
            marks: [],
            summary: null,
            loading: false,
            error: e.message || "Could not load this student's record",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [admissionNo, days]);

  return state;
}
