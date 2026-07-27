import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius, spacing, typography, shadow, fonts } from "../theme/theme";

export function Card({ style, children, ...rest }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function Pill({ label, tone = "neutral", style }) {
  const tones = {
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warning },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
    neutral: { bg: colors.cardAlt, fg: colors.textMuted },
    primary: { bg: colors.cardAlt, fg: colors.text },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <View style={[{ backgroundColor: t.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }, style]}>
      <Text style={{ color: t.fg, fontSize: 12, fontFamily: fonts.semibold }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.primaryBtn, disabled && { opacity: 0.5 }, style]}
    >
      <Text style={styles.primaryBtnText}>{title}</Text>
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

export function IconCircle({ children, bg = colors.cardAlt, size = 52 }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
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
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    // White card on a white ground — the hairline border is what defines it.
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 15,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
});
