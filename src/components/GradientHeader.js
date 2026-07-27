import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../theme/theme";

export default function GradientHeader({ children, style }) {
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.band, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + 28,
    alignItems: "center",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
});