import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { fromRow as dutyFromRow } from "./duties";

/**
 * Reading attendance for a day OTHER than the one the app is currently
 * working on.
 *
 * `SchoolDataContext` deliberately holds a single day — the one being marked —
 * because everything that writes (submit, reassign, escalate) only ever
 * touches today. History is read-only and unbounded, so it is fetched on
 * demand here rather than being kept in that shared state.
 */

/** Days that have duties, newest first — the only days worth offering. */
export async function fetchDutyDays(limit = 21) {
  // Postgrest has no DISTINCT, so take an ordered window and dedupe. A school
  // day has roughly ten duties, so 400 rows covers about six weeks.
  const { data, error } = await supabase
    .from("duties")
    .select("day")
    .order("day", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);

  const seen = [];
  for (const row of data || []) {
    if (row.day && !seen.includes(row.day)) seen.push(row.day);
    if (seen.length >= limit) break;
  }
  return seen;
}

/**
 * Every duty on `day`, plus the marks of the ones that were submitted.
 * Returns the same shape the rest of the app already understands:
 * `{ duties, records: { [dutyId]: { statuses: { admissionNo: code } } } }`.
 */
export async function fetchDayAttendance(day) {
  const { data: dutyRows, error } = await supabase
    .from("duties")
    .select("*, checkpoints(name, start_min, end_min)")
    .eq("day", day)
    .order("id");
  if (error) throw new Error(error.message);

  const duties = (dutyRows || []).map(dutyFromRow);
  const submitted = duties.filter((d) => d.state === "submitted");
  if (!submitted.length) return { duties, records: {} };

  // One query for the whole day rather than one per duty — a full day is ten
  // checkpoints, and ten round trips on a school Wi-Fi connection is felt.
  const { data: marks, error: attErr } = await supabase
    .from("attendance")
    .select("duty_id, admission_no, status")
    .in(
      "duty_id",
      submitted.map((d) => d.id)
    );
  if (attErr) throw new Error(attErr.message);

  const records = {};
  submitted.forEach((d) => {
    records[d.id] = { statuses: {}, submittedBy: d.submittedBy, submittedAt: d.submittedAt };
  });
  // A null status means Present, which is stored as the absence of a value.
  (marks || []).forEach((m) => {
    if (m.status && records[m.duty_id]) records[m.duty_id].statuses[m.admission_no] = m.status;
  });

  return { duties, records };
}

/**
 * Loads one past day. Pass `null` to skip fetching entirely — the caller uses
 * its live data for the current day rather than re-reading it.
 */
export function useDayAttendance(day) {
  const [state, setState] = useState({ duties: [], records: {}, loading: false, error: null });

  useEffect(() => {
    if (!day) {
      setState({ duties: [], records: {}, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchDayAttendance(day)
      .then((res) => {
        // A slow request for a day the teacher has already navigated away from
        // must not overwrite what they are looking at now.
        if (!cancelled) setState({ ...res, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setState({
            duties: [],
            records: {},
            loading: false,
            error: e.message || "Could not load that day",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  return state;
}

/** Days that have duties, for the date picker. */
export function useDutyDays() {
  const [days, setDays] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchDutyDays()
      .then((d) => !cancelled && setDays(d))
      .catch((e) => !cancelled && setError(e.message || "Could not load past days"));
    return () => {
      cancelled = true;
    };
  }, []);

  return { days, error };
}
