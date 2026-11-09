import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { useSchoolData } from "./SchoolDataContext";
import { useToast } from "../components/Toast";
import { receivesGateNotices, roleLabel } from "../domain/roles";
import { STATUS_META } from "../data/mockData";
import {
  fetchNotifications,
  fromRow,
  markNotificationsRead,
  subscribeNotifications,
} from "../lib/notifications";
import { showNoticeNow } from "../lib/reminders";

/**
 * Gate notifications for the people a missing child escalates to — every
 * sign-out and sign-in, whoever did it (migration 047).
 *
 * Three ways a notice reaches a coordinator, from loudest to quietest:
 *   1. live, while the app is open: a toast plus a phone notification
 *   2. on return to the app: the list reloads and the unread badge shows
 *   3. the Notifications screen, which holds every notice ever sent, so one
 *      that was missed — phone off, app closed — is still there to read.
 *
 * For any other role this provider does nothing and `enabled` is false.
 */

const NotificationsContext = createContext({
  enabled: false,
  items: [],
  unread: 0,
  loading: false,
  error: null,
  refresh: () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  describe: () => ({ title: "", body: "" }),
});

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const { students, staffName, refreshLeaves } = useSchoolData();
  const toast = useToast();
  const enabled = !!user && receivesGateNotices(user.role);
  const me = user?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const studentsByAdm = useMemo(() => new Map((students || []).map((s) => [s.adm, s])), [students]);

  const describe = useCallback(
    (n) => {
      const s = studentsByAdm.get(n.adm);
      const name = s?.name || n.adm;
      const cls = s?.label ? ` (${s.label})` : "";
      const by = n.actor
        ? n.actor === me
          ? "you"
          : `${staffName(n.actor) || "a colleague"}${n.actorRole ? ` · ${roleLabel(n.actorRole)}` : ""}`
        : "unknown";
      if (n.kind === "student_in") {
        return { title: `${name}${cls} is back on campus`, body: `Signed in by ${by}` };
      }
      const status = STATUS_META[n.status]?.label || n.status || "Away";
      const reason = n.reason ? ` — ${n.reason}` : "";
      return { title: `${name}${cls} signed out · ${status}`, body: `Signed out by ${by}${reason}` };
    },
    [studentsByAdm, staffName, me]
  );

  // Kept in a ref so the realtime callback always sees the current names
  // without resubscribing every time the register reloads.
  const describeRef = useRef(describe);
  describeRef.current = describe;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setItems(await fetchNotifications(me));
      setError(null);
    } catch (e) {
      setError(e.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [enabled, me]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return undefined;
    }
    refresh();

    const unsubscribe = subscribeNotifications((row) => {
      const n = fromRow(row, me);
      // The person who did it was already marked read by the trigger.
      if (n.actor && n.actor === me) n.read = true;
      setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
      if (!n.read) {
        const d = describeRef.current(n);
        toast.show(d.title, { tone: n.kind === "student_out" ? "info" : "success" });
        showNoticeNow({ title: d.title, body: d.body });
      }
      // Keep the Gate screen and marking locks in step with the new leave.
      refreshLeaves?.();
    });

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    return () => {
      unsubscribe();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, me]);

  const markRead = useCallback(async (ids) => {
    if (!ids?.length) return;
    const set = new Set(ids);
    setItems((prev) => prev.map((n) => (set.has(n.id) ? { ...n, read: true } : n)));
    try {
      await markNotificationsRead(ids);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markNotificationsRead(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const value = useMemo(
    () => ({ enabled, items, unread, loading, error, refresh, markRead, markAllRead, describe }),
    [enabled, items, unread, loading, error, refresh, markRead, markAllRead, describe]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
