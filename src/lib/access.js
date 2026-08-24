import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { fromRow as staffFromRow } from "./staff";

/**
 * Asking for access, and granting it.
 *
 * Every write here is an RPC, never a table write. `staff_requests` has no
 * INSERT or UPDATE policy at all (migration 013): the client cannot set who a
 * request is from, what state it is in, or what role an approval grants,
 * because there is no column it is allowed to touch. What looks like extra
 * indirection is the whole security model.
 */

export const REQUEST_STATE = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const fromRow = (r) =>
  r && {
    id: r.id,
    authUserId: r.auth_user_id,
    name: r.name,
    email: r.email,
    phone: r.phone || "",
    note: r.note || "",
    state: r.state,
    requestedAt: r.requested_at,
    decidedBy: r.decided_by || null,
    decidedAt: r.decided_at || null,
    decisionNote: r.decision_note || "",
  };

/**
 * The signed-in caller's own request, or null.
 *
 * `maybeSingle` rather than `single`: having no request is the normal state
 * for someone who has just confirmed their email, and `single` reports it as
 * an error, which would put "something went wrong" in front of a person whose
 * only problem is that they have not filled the form in yet.
 */
export async function fetchMyRequest() {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("staff_requests")
    .select("*")
    .eq("auth_user_id", uid)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

/**
 * File a request. Works with or without a session, which is the point: this
 * project requires email confirmation, so `signUp` hands back no token and the
 * old `request_staff_access` had nothing to write with — the coordinator saw
 * nothing until the person came back and signed in.
 *
 * Returns nothing. The function is deliberately silent about whether the
 * address already belongs to staff, so this form cannot be used to test which
 * addresses work at the school.
 */
export async function submitAccessRequest({ name, email, phone }) {
  const { error } = await supabase.rpc("submit_access_request", {
    p_name: name,
    p_email: email,
    p_phone: phone || null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Join this account to a staff row or request that was created before it
 * existed — the teacher approved while their confirmation email sat unread.
 * A no-op in the ordinary case, and refused by the database unless the address
 * is confirmed, so it is safe to call on every sign-in.
 */
export async function linkStaffAccount() {
  const { data, error } = await supabase.rpc("link_staff_account");
  if (error) throw new Error(error.message);
  return data || null;
}

/** Every request still waiting, newest first. Coordinator and admin only. */
export async function fetchPendingRequests() {
  const { data, error } = await supabase
    .from("staff_requests")
    .select("*")
    .eq("state", REQUEST_STATE.PENDING)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

/**
 * Turn a request into a staff row. Always role `teacher` — see migration 013.
 *
 * `classKey` ('4|A') is optional and is a SECOND grant, not a label: 004's
 * policies key off it to open that class's attendance across every duty. Null
 * means duty staff with no class of their own, which is a normal outcome.
 */
export async function approveRequest(requestId, classKey = null) {
  const { data, error } = await supabase.rpc("approve_staff_request", {
    p_request: requestId,
    p_class_key: classKey || null,
  });
  if (error) throw new Error(error.message);
  return staffFromRow(Array.isArray(data) ? data[0] : data);
}

export async function rejectRequest(requestId, note) {
  const { data, error } = await supabase.rpc("reject_staff_request", {
    p_request: requestId,
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
  return fromRow(Array.isArray(data) ? data[0] : data);
}

/**
 * The pending queue, for the Roster's Staff tab.
 *
 * Deliberately not in SchoolDataContext: that holds the day's marking data,
 * which every screen reads on every render. This is a short list that one
 * role looks at occasionally, so it loads where it is shown.
 */
export function usePendingRequests(enabled = true) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    try {
      setRequests(await fetchPendingRequests());
    } catch (e) {
      setError(e.message || "Could not load access requests");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { requests, loading, error, reload: load };
}
