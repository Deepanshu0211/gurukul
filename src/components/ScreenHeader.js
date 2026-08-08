import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, fonts } from "../theme/theme";

/**
 * Standard page header used across the tab screens so titles, subtitles and
 * trailing badges line up identically everywhere.
 *
 *   <ScreenHeader title="Roster" subtitle="Friday, 7:42 AM" />
 *   <ScreenHeader eyebrow="RADHE RADHE" title="Krishna" right={<Badge/>} />
 */
export default function ScreenHeader({ eyebrow, title, subtitle, right, children }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.titleCol}>
          {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
          {/* numberOfLines guards long staff names from pushing the badge
              off screen or wrapping to three lines. */}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {!!right && <View style={styles.right}>{right}</View>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  titleCol: { flex: 1, minWidth: 0 },
  right: { flexShrink: 0, paddingTop: 2 },

  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 1,
  },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
});
