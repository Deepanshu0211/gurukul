import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Persisted resolutions for safety alerts (SRS F4).
 *
 * The ALERT is not stored — `domain/alerts.js` derives it from the day's
 * attendance, so it can never disagree with the marks. What has to survive a
 * restart is the human part: who accounted for the child and what they said.
 * That is this table, keyed by the same (duty, student) pair the derived
 * alert uses for its id.
 *
 * Before this existed the remark lived in React state, so an absent child
 * marked "found — in the sick bay" was an open alert again the next time the
 * app launched.
 */

const keyOf = (dutyId, admissionNo) => `${dutyId}:${admissionNo}`;

export const fromRow = (r) => ({
  key: keyOf(r.duty_id, r.admission_no),
  dutyId: r.duty_id,
  admissionNo: r.admission_no,
  kind: r.kind,
  remark: r.remark,
  resolvedBy: r.resolved_by,
  resolvedAt: r.resolved_at,
});

/** Resolutions for a day, as `{ "dutyId:admissionNo": resolution }`. */
export async function fetchResolutions(day) {
  let query = supabase.from("alert_resolutions").select("*, duties!inner(day)");
  if (day) query = query.eq("duties.day", day);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out = {};
  (data || []).forEach((r) => {
    const res = fromRow(r);
    out[res.key] = res;
  });
  return out;
}

/**
 * Record that a child has been accounted for. Upsert rather than insert: a
 * second look at the same alert corrects the remark instead of failing, and
 * the trigger in migrations/008 logs both the original and the correction.
 */
export async function resolveAlert({ dutyId, admissionNo, kind, remark, staffId }) {
  const { data, error } = await supabase
    .from("alert_resolutions")
    .upsert(
      {
        duty_id: dutyId,
        admission_no: admissionNo,
        kind,
        remark,
        resolved_by: staffId,
        resolved_at: new Date().toISOString(),
      },
      { onConflict: "duty_id,admission_no" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

/** Resolutions for one day, reloaded whenever `day` or `nonce` changes. */
export function useResolutions(day, nonce = 0) {
  const [resolutions, setResolutions] = useState({});
  const [error, setError] = useState(null);

  const apply = useCallback((res) => {
    setResolutions((prev) => ({ ...prev, [res.key]: res }));
  }, []);

  useEffect(() => {
    if (!day) return undefined;
    let cancelled = false;
    fetchResolutions(day)
      .then((r) => !cancelled && setResolutions(r))
      .catch((e) => !cancelled && setError(e.message || "Could not load resolutions"));
    return () => {
      cancelled = true;
    };
  }, [day, nonce]);

  return { resolutions, error, apply };
}
