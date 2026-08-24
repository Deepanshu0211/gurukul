import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchStaffMaybeByEmail } from "../lib/staff";

const AuthContext = createContext(null);

/**
 * Who is signed in, and whether they are anybody yet.
 *
 * There are THREE states, not two. Before self-registration there were only
 * ever "signed out" and "signed in as staff", because an Auth account without
 * a matching `staff` row could only happen by mistake. Now it is the normal
 * first state of every new teacher:
 *
 *   user = null, pending = null  -> signed out. Login screen.
 *   user = null, pending = {…}   -> signed in, no staff row. Waiting screen.
 *   user = {…}                   -> staff. The app.
 *
 * `pending` is not a permission. Migration 012 means an account in that state
 * reads nothing but its own access request; the screen it lands on is a
 * courtesy, not a gate. The gate is the database.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [pending, setPending] = useState(null);
  // True while we check for a stored session, so the login screen doesn't
  // flash before we know whether someone is already signed in.
  const [restoring, setRestoring] = useState(true);

  /**
   * Turn a session into one of the three states above. One code path, called
   * from session restore, from the auth listener and from the login screen —
   * previously the login screen did its own staff lookup and set the user from
   * the RAW row, so `classKey` was undefined until the next app start and a
   * class teacher lost their "My Class" tab for the rest of the session.
   */
  const resolveSession = useCallback(async (session) => {
    const email = session?.user?.email;
    if (!email) {
      setUser(null);
      setPending(null);
      return null;
    }
    try {
      const staff = await fetchStaffMaybeByEmail(email);
      if (staff) {
        setUser(staff);
        setPending(null);
        return staff;
      }
      // Signed in and nobody — the state a new teacher sits in between
      // confirming their email and a coordinator approving them.
      setUser(null);
      setPending({ email, authUserId: session.user.id });
      return null;
    } catch (e) {
      // A failed lookup is not the same as "no staff row": treating a dropped
      // connection as "you are not staff" would show a confirmed teacher the
      // request form and invite a duplicate request.
      console.warn("Could not resolve session:", e?.message);
      setUser(null);
      setPending(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Never let session restoration block the app. If storage or the network
    // stalls, fall through to the login screen instead of a blank screen.
    const failsafe = setTimeout(() => {
      if (!cancelled) setRestoring(false);
    }, 4000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) await resolveSession(data?.session);
      } catch (e) {
        console.warn("Session restore failed:", e?.message);
      } finally {
        if (!cancelled) {
          clearTimeout(failsafe);
          setRestoring(false);
        }
      }
    })();

    // Keeps the app in step if the session expires or is refreshed elsewhere.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
        setPending(null);
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // No `!user` guard here. The old one read a captured value from the
        // effect's first run, so whether it re-resolved depended on when the
        // event arrived rather than on anything meaningful.
        resolveSession(session);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      sub?.subscription?.unsubscribe();
    };
  }, [resolveSession]);

  const value = useMemo(
    () => ({
      user,
      pending,
      restoring,
      resolveSession,
      /** Re-read the signed-in account — after an approval lands, say. */
      refreshSession: async () => {
        const { data } = await supabase.auth.getSession();
        return resolveSession(data?.session);
      },
      login: (staff) => {
        setUser(staff);
        setPending(null);
      },
      /** Merge a partial profile update so the UI reflects it immediately,
       *  without a round trip to re-read the row. */
      updateUser: (patch) => setUser((prev) => (prev ? { ...prev, ...patch } : prev)),
      logout: async () => {
        // Clear locally even if the network call fails, so the user is never
        // stuck signed in on the device.
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.warn("Sign out request failed:", e?.message);
        }
        setUser(null);
        setPending(null);
      },
    }),
    [user, pending, restoring, resolveSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
