import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The activity log.
 *
 * There is no role check here on purpose. What comes back is decided entirely
 * by the `audit_log_select` policy in migrations/007 — oversight roles get the
 * school, everyone else gets only the entries naming them. Filtering a second
 * time in the client would be a rule that could drift from the enforced one,
 * and the more dangerous kind of drift is the one that looks stricter than it
 * is.
 */

export const fromRow = (r) => ({
  id: r.id,
  at: r.at,
  action: r.action,
  actorId: r.actor_id,
  subjectId: r.subject_id,
  relatedId: r.related_id,
  dutyId: r.duty_id,
  admissionNo: r.admission_no,
  severity: r.severity,
  field: r.field,
  oldValue: r.old_value,
  newValue: r.new_value,
  // Joined so the feed can say "Mangalarati" rather than "mang", and show the
  // day the checkpoint belonged to rather than only when it was logged.
  checkpoint: r.duties?.checkpoints?.name || r.duties?.checkpoint_id || null,
  day: r.duties?.day || null,
});

/**
 * Newest first. `limit` is a screenful or two — this list is unbounded and
 * grows for the life of the school, so it is never fetched whole.
 *
 * `severity` narrows to the operational record (attendance, cover,
 * reassignment, alerts) and drops the routine sign-in and profile traffic.
 * It is a convenience, not a permission: an administrator asking for
 * everything gets everything, and everyone else is already narrowed by the
 * policy in migrations/008 before this filter is applied.
 */
export async function fetchAuditLog({ limit = 100, severity = null, since = null } = {}) {
  let query = supabase
    .from("audit_log")
    .select("*, duties(day, checkpoint_id, checkpoints(name))")
    .order("at", { ascending: false })
    .limit(limit);

  if (severity) query = query.eq("severity", severity);
  if (since) query = query.gte("at", since);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

export function useAuditLog(options = {}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { limit = 100, severity = null, since = null } = options;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    fetchAuditLog({ limit, severity, since })
      .then((rows) => !cancelled && setEntries(rows))
      .catch((e) => !cancelled && setError(e.message || "Could not load the activity log"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [limit, severity, since]);

  useEffect(load, [load]);

  return { entries, loading, error, reload: load };
}
