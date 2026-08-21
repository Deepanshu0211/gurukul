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
    records[d.id] = {
      statuses: {},
      submittedBy: d.submittedBy,
      submittedAt: d.submittedAt,
      correctedBy: d.correctedBy,
      correctedAt: d.correctedAt,
    };
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

/**
 * A teacher's own marking record, all-time: how many checkpoints they have
 * submitted, how many student marks that came to, and how many of those were
 * absences.
 *
 * `submitDuty` writes one attendance row per student INCLUDING present ones
 * (present is stored as a null status), so counting rows is a true count of
 * children checked — not just the exceptions.
 */
export async function fetchMarkingTotals(staffId) {
  const empty = { taken: 0, marked: 0, absent: 0 };
  if (!staffId) return empty;

  // Filtered through an inner join rather than by collecting duty ids and
  // passing them to `.in(...)`. That version built a query string containing
  // every duty the teacher had ever submitted — fine in week one, and a URL
  // over the gateway's length limit by the end of a term, failing with a 414
  // that would have looked like a server outage.
  const scoped = (q) =>
    q
      .select("*, duties!inner(submitted_by, state)", { count: "exact", head: true })
      .eq("duties.submitted_by", staffId)
      .eq("duties.state", "submitted");

  const [taken, marked, absent] = await Promise.all([
    supabase
      .from("duties")
      .select("*", { count: "exact", head: true })
      .eq("submitted_by", staffId)
      .eq("state", "submitted"),
    scoped(supabase.from("attendance")),
    scoped(supabase.from("attendance")).eq("status", "A"),
  ]);

  for (const r of [taken, marked, absent]) {
    if (r.error) throw new Error(r.error.message);
  }

  return {
    taken: taken.count || 0,
    marked: marked.count || 0,
    absent: absent.count || 0,
  };
}

/** The stat strip at the top of Records. Refetched whenever `nonce` changes. */
export function useMarkingTotals(staffId, nonce = 0) {
  const [totals, setTotals] = useState({ taken: 0, marked: 0, absent: 0, loading: true });

  useEffect(() => {
    let cancelled = false;
    setTotals((t) => ({ ...t, loading: true }));
    fetchMarkingTotals(staffId)
      .then((res) => !cancelled && setTotals({ ...res, loading: false }))
      // A failed tally is not worth an error state on the whole screen — the
      // list below it is the part the teacher came for.
      .catch(() => !cancelled && setTotals({ taken: 0, marked: 0, absent: 0, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [staffId, nonce]);

  return totals;
}

/**
 * Which days in a calendar month have a submitted checkpoint, so the picker
 * can mark them rather than offering 31 identical-looking dates.
 * `month` is 0-indexed, matching JS Date.
 */
export async function fetchMarkedDaysInMonth(year, month) {
  const pad = (n) => String(n).padStart(2, "0");
  const from = `${year}-${pad(month + 1)}-01`;
  // Day 0 of the next month is the last day of this one.
  const to = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

  const { data, error } = await supabase
    .from("duties")
    .select("day")
    .eq("state", "submitted")
    .gte("day", from)
    .lte("day", to);
  if (error) throw new Error(error.message);

  return new Set((data || []).map((r) => r.day));
}
