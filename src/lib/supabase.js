import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
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
