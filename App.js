import React, { useCallback } from "react";
import { View } from "react-native";
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
import { AuthProvider } from "./src/context/AuthContext";
import { SchoolDataProvider } from "./src/context/SchoolDataContext";
import { DialogProvider } from "./src/components/Dialog";
import RootNavigator from "./src/navigation/RootNavigator";

// Hold the native splash until the fonts are ready, so text never flashes
// in the system font first and then re-render in the real one.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Read the saved haptics preference once at startup so the marking screen
// never has to await storage in the middle of a tap.
loadHapticsPreference();

export default function App() {
  const [fontsLoaded] = useFonts({
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

  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} onLayout={onLayoutRootView}>
      <SafeAreaProvider style={{ backgroundColor: "#FFFFFF" }}>
        <AuthProvider>
          <AttendanceProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AttendanceProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}
