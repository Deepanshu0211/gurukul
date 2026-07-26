import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import { AttendanceProvider } from "./src/context/AttendanceContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AuthProvider>
      <AttendanceProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AttendanceProvider>
    </AuthProvider>
  );
}
