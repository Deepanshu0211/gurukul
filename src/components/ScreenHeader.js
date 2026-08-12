import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography, fonts } from "../theme/theme";

/**
 * The page header for every tab screen. Using one component is what keeps
 * "Today", "Roster" and "Account" on the same baseline, at the same size,
 * with the same gap to the content below — previously each screen declared
 * its own title style at 21, 26 or 28pt.
 *
 *   <ScreenHeader title="Roster" subtitle="Friday, 7:42 AM" />
 *   <ScreenHeader eyebrow="CLASS" title="4 A" right={<Pill … />} />
 */
export default function ScreenHeader({ eyebrow, title, subtitle, right, children, style }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.topRow}>
        <View style={styles.titleCol}>
          {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>}
          {/* numberOfLines guards long staff names from pushing the trailing
              element off screen or wrapping to three lines. */}
          <Text style={typography.screenTitle} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {/* Aligned to the title's cap height rather than the column top, so a
            badge sits level with the word beside it. */}
        {!!right && <View style={styles.right}>{right}</View>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // No top padding: the screen owns the gap below the status bar via
  // layout.screenTop, so a header never adds a second, different one.
  wrap: { paddingBottom: spacing.md },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  titleCol: { flex: 1, minWidth: 0 },
  right: { flexShrink: 0 },

  eyebrow: { ...typography.label, marginBottom: 2 },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 3,
  },
});
