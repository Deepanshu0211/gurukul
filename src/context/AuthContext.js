import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True while we check for a stored session, so the login screen doesn't
  // flash before we know whether someone is already signed in.
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadStaffFor = async (email) => {
      try {
        const { data } = await supabase.from("staff").select("*").eq("email", email).single();
        if (!cancelled && data) setUser(data);
      } catch (e) {
        // A failed staff lookup just means we show the login screen.
        console.warn("Could not restore staff record:", e?.message);
      }
    };

    // Never let session restoration block the app. If storage or the network
    // stalls, fall through to the login screen instead of a blank screen.
    const failsafe = setTimeout(() => {
      if (!cancelled) setRestoring(false);
    }, 4000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email;
        if (email) await loadStaffFor(email);
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
      if (event === "SIGNED_OUT") setUser(null);
      else if (session?.user?.email && !user) loadStaffFor(session.user.email);
    });

    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      sub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      user,
      restoring,
      login: (staff) => setUser(staff),
      logout: async () => {
        // Clear locally even if the network call fails, so the user is never
        // stuck signed in on the device.
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.warn("Sign out request failed:", e?.message);
        }
        setUser(null);
      },
    }),
    [user, restoring]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
