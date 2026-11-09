import { supabase } from "./supabase";
import { isNotDeployed } from "./errors";

/**
 * Gate notifications — every sign-out and sign-in at the gate (migration 047).
 *
 * Rows are written ONLY by a trigger on `student_leave`; there is no insert
 * here and the table has no insert policy. Who can read them is decided by
 * the `notifications_read` policy (coordinator, MOD/management, admin) — a
 * teacher asking gets an empty list, not an error.
 *
 * "Read" is per person (`notification_reads`), so one coordinator opening a
 * notice does not hide it from the Principal.
 */

export const fromRow = (r, me) => ({
  id: r.id,
  kind: r.kind, // "student_out" | "student_in"
  adm: r.admission_no,
  status: r.status,
  reason: r.reason || "",
  expectedBack: r.expected_back || null,
  actor: r.actor || null,
  actorRole: r.actor_role || null,
  at: r.created_at,
  read: Array.isArray(r.notification_reads)
    ? r.notification_reads.some((x) => x.staff_id === me)
    : false,
});

/** Newest first. `me` is the reader's staff id, for the read flag. */
export async function fetchNotifications(me, limit = 200) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*, notification_reads(staff_id)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // A server without 047 has nothing to show; say so quietly.
    if (isNotDeployed(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((r) => fromRow(r, me));
}

/** Mark some (or, with no ids, all) notifications read for the caller. */
export async function markNotificationsRead(ids = null) {
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  if (error) throw new Error(error.message);
}

/**
 * Live inserts. Realtime applies the read policy, so a role that cannot read
 * the table simply never hears anything. Returns an unsubscribe function.
 */
export function subscribeNotifications(onInsert) {
  const channel = supabase
    .channel(`gate-notices-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
