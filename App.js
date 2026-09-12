import React, { useCallback, useEffect, useState } from "react";
import { View, ImageBackground } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  GoogleSans_400Regular,
  GoogleSans_500Medium,
  GoogleSans_600SemiBold,
  GoogleSans_700Bold,
} from "@expo-google-fonts/google-sans";
// Fraunces + Manrope are used by the login screen only — its design was
// signed off before the rest of the app moved to Google Sans.
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import { loadHapticsPreference } from "./src/lib/haptics";
import { supabaseConfigError } from "./src/lib/supabase";
import { AuthProvider } from "./src/context/AuthContext";
import { SchoolDataProvider } from "./src/context/SchoolDataContext";
import { DialogProvider } from "./src/components/Dialog";
import { ToastProvider } from "./src/components/Toast";
import ErrorBoundary from "./src/components/ErrorBoundary";
import ConfigError from "./src/components/ConfigError";
import RootNavigator from "./src/navigation/RootNavigator";

// Hold the native splash until the fonts are ready, so text never flashes
// in the system font first and then re-render in the real one.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Read the saved haptics preference once at startup so the marking screen
// never has to await storage in the middle of a tap.
loadHapticsPreference();

/**
 * How long to wait for fonts before showing the app anyway.
 *
 * `useFonts` reports failure through its second return value, but it can also
 * simply never settle — and the splash is only hidden once fonts are loaded,
 * so a font loader that hangs leaves the app frozen on the splash screen with
 * no error and no way out. To a teacher at 4:30 AM that is indistinguishable
 * from a crash. The app is perfectly usable in the system font; a missing
 * typeface is not a reason to withhold the register.
 */
const FONT_TIMEOUT_MS = 6000;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    GoogleSans_400Regular,
    GoogleSans_500Medium,
    GoogleSans_600SemiBold,
    GoogleSans_700Bold,
    Fraunces_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const [fontsTimedOut, setFontsTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return undefined;
    const t = setTimeout(() => setFontsTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  const ready = fontsLoaded || !!fontError || fontsTimedOut;

  const onLayoutRootView = useCallback(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Hide the splash even if the root never lays out — the onLayout callback
  // above is the normal path, this is the one that stops a stuck splash from
  // being the user's whole experience of the app.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // A build with no backend configuration cannot do anything at all, so it
  // says so rather than showing a login screen whose every request will fail.
  if (supabaseConfigError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FAF2E6" }} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <ConfigError detail={supabaseConfigError} />
        </SafeAreaProvider>
      </View>
    );
  }

  return (
    // The root carries the artwork's own cream so that any pixel the image
    // hasn't covered — behind a transparent system bar, or during the first
    // frame — is light rather than black.
    <View style={{ flex: 1, backgroundColor: "#FAF2E6" }} onLayout={onLayoutRootView}>
      {/* Outermost, and outside every provider: a throw from any of them —
          or from the navigator — has to land somewhere that can still draw. */}
      <ErrorBoundary>
        <SafeAreaProvider style={{ backgroundColor: "transparent" }}>
          <ImageBackground
            source={require("./src/assets/bg.png")}
            style={{ flex: 1 }}
            resizeMode="cover"
          >
            <AuthProvider>
              <SchoolDataProvider>
                <DialogProvider>
                  {/* Toast sits inside Dialog so a confirmation can be shown
                      from a dialog's onConfirm handler. */}
                  <ToastProvider>
                    <StatusBar style="dark" backgroundColor="transparent" translucent />
                    <RootNavigator />
                  </ToastProvider>
                </DialogProvider>
              </SchoolDataProvider>
            </AuthProvider>
          </ImageBackground>
        </SafeAreaProvider>
      </ErrorBoundary>
    </View>
  );
}
