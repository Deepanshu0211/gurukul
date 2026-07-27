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
      const { data } = await supabase.from("staff").select("*").eq("email", email).single();
      if (!cancelled && data) setUser(data);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const email = data?.session?.user?.email;
        if (email) return loadStaffFor(email);
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    // Keeps the app in step if the session expires or is refreshed elsewhere.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
      else if (session?.user?.email && !user) loadStaffFor(session.user.email);
    });

    return () => {
      cancelled = true;
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
        await supabase.auth.signOut();
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
