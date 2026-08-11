import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius, spacing, typography, shadow, fonts } from "../theme/theme";
import { GlassView } from "./GlassView";

export function Card({ style, children, cornerRadius = 24, ...rest }) {
  return (
    <GlassView cornerRadius={cornerRadius} style={[styles.card, style]} {...rest}>
      {children}
    </GlassView>
  );
}

export function Pill({ label, tone = "neutral", style }) {
  const tones = {
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warning },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
    neutral: { bg: "rgba(238, 244, 250, 0.85)", fg: colors.textMuted },
    primary: { bg: "rgba(28, 78, 128, 0.12)", fg: colors.primary },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <View style={[{ backgroundColor: t.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.6)" }, style]}>
      <Text style={{ color: t.fg, fontSize: 12, fontFamily: fonts.semibold }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, style, textStyle }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }, style]}
    >
      <Text style={[styles.primaryBtnText, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, onPress, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.secondaryBtn, style]}>
      <Text style={styles.secondaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function IconCircle({ children, bg = "rgba(238, 244, 250, 0.85)", size = 52 }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.7)",
      }}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[typography.h2, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.76)",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    borderTopColor: "rgba(255, 255, 255, 0.95)",
    borderBottomColor: "rgba(255, 255, 255, 0.45)",
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C4E80",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 15,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    backgroundColor: "rgba(238, 244, 250, 0.85)",
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.7)",
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
});
