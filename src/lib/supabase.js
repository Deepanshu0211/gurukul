import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * The Supabase client, and the one rule about it: creating it must never be
 * able to kill the app.
 *
 * `createClient(undefined, undefined)` throws `supabaseUrl is required.` — at
 * MODULE SCOPE, while the bundle is still being evaluated, before React
 * mounts and before any error boundary exists. The app dies on the splash
 * screen with nothing on screen to say why.
 *
 * That is not a hypothetical. `EXPO_PUBLIC_*` values are read from `.env` at
 * BUILD time and inlined into the bundle, and `.env` is gitignored — so it is
 * present on the machine running `expo start` and absent on a CI/EAS builder.
 * The dev build worked and the installable build crashed instantly on launch.
 * The fix has two halves:
 *
 *   1. here — never throw; report the misconfiguration as a value, so the app
 *      can put a readable screen in front of it (see `App.js`);
 *   2. `eas.json` — give the build the two EXPO_PUBLIC_ values, so a real
 *      build gets a real client.
 *
 * Only the two `EXPO_PUBLIC_` values belong in a build. The service-role key
 * in `.env` must never reach one: it bypasses every RLS policy in the
 * database, and anything inlined into the bundle is readable by anyone
 * holding the APK.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Non-null when the app was built without its backend configuration. Read by
 * `App.js`, which shows a plain explanation instead of a dead screen.
 */
export const supabaseConfigError = (() => {
  const missing = [
    !url && "EXPO_PUBLIC_SUPABASE_URL",
    !anonKey && "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  return missing.length ? missing.join(" and ") : null;
})();

export const isSupabaseConfigured = !supabaseConfigError;

/**
 * Placeholders keep `createClient` from throwing when the build is
 * misconfigured. `.invalid` is reserved by RFC 2606 and can never resolve, so
 * a request that slips through fails as a network error rather than reaching
 * somebody else's server.
 */
export const supabase = createClient(
  url || "https://unconfigured.invalid",
  anonKey || "unconfigured-anon-key",
  {
    auth: {
      // Without a storage adapter the session lives in memory only, so every
      // app restart drops the user back to the login screen. AsyncStorage
      // keeps them signed in between launches.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar, so there is no OAuth redirect to parse.
      detectSessionInUrl: false,
    },
  }
);
