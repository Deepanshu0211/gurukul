import React from "react";
import { View, StyleSheet } from "react-native";

/**
 * Universal Liquid Glass View Component.
 * Provides high-fidelity translucent frosted glass UI styling with specular
 * edge highlights and soft ambient shadows across all devices and Expo Go.
 */
export function GlassView({
  children,
  style,
  cornerRadius = 24,
  ...props
}) {
  return <View style={[styles.glass, { borderRadius: cornerRadius }, style]} {...props}>{children}</View>;
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    borderTopColor: "rgba(255, 255, 255, 0.95)",
    borderBottomColor: "rgba(255, 255, 255, 0.45)",
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
});
