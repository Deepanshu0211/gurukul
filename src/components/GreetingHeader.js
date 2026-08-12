import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { colors, spacing, radius, fonts, loginFonts, surface, typography } from "../theme/theme";
import { Pill } from "./ui";
import ProgressBar from "./ProgressBar";
import Avatar from "./Avatar";
import { givenName } from "../utils/format";

// Background motif — a peacock feather rather than a depiction of Krishna,
// so no interface element is ever laid over the deity. Transparent PNG.
const MOTIF = require("../assets/peacock-feather.png");

const AVATAR_SIZE = 52;
// The motif gets its own column rather than being absolutely positioned over
// the card. Overlaying it meant the name, the meta line and the "N pending"
// badge could all end up on top of the feather at longer text lengths; a real
// column makes the collision impossible at any string length or font scale.
const MOTIF_COL = 84;

/**
 * Greeting card at the top of the Duties screen: profile picture, greeting,
 * name, and today's submission progress.
 *
 * Deliberately the one warm, non-monochrome surface in the app — the human
 * moment before the work starts, echoing the login illustration. Everything
 * that carries attendance data stays neutral so colour only ever means
 * "something needs attention".
 *
 * "Radhe Radhe" uses the brand serif rather than the UI sans: it is a
 * devotional line, not an interface label.
 *
 * @param user   staff row; optional `photoUrl` falls back to an initial
 * @param meta   small line under the name
 * @param done / total  submission counts; progress hides when total is 0
 * @param badge  { text, tone: 'warning' | 'success', icon? }
 */
export default function GreetingHeader({ user, meta, done = 0, total = 0, badge }) {
  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.identity}>
          <Avatar name={user?.name} src={user?.photoUrl} size={AVATAR_SIZE} tone="warm" bordered />
          <View style={styles.textCol}>
            <Text style={styles.greeting}>Radhe Radhe</Text>
            <Text style={styles.name} numberOfLines={1}>
              {givenName(user?.name)}
            </Text>
          </View>
        </View>

        {!!meta && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}

        {total > 0 && (
          <View style={styles.progressBlock}>
            <View style={styles.progressTop}>
              <Text style={styles.progressText} numberOfLines={1}>
                <Text style={styles.progressCount}>{done}</Text> of {total} submitted
              </Text>
              {/* The badge belongs with the counts it describes, pinned to the
                  same right edge as the progress bar below it. */}
              {!!badge && <Pill label={badge.text} icon={badge.icon} tone={badge.tone} />}
            </View>
            {/* Cream on a translucent white well — the app's success green
                would sit almost invisibly on this depth of teal. */}
            <ProgressBar done={done} total={total} color={colors.accent} style={styles.track} />
          </View>
        )}
      </View>

      {/* Decorative only — hidden from screen readers. */}
      <View style={styles.motifCol} pointerEvents="none">
        <Image
          source={MOTIF}
          style={styles.motif}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surface.inverse,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    overflow: "hidden",
  },
  content: { flex: 1, minWidth: 0 },

  motifCol: { width: MOTIF_COL, marginRight: -spacing.md, justifyContent: "center" },
  // Oversized inside its column and allowed to bleed off the card's right
  // edge, so the feather still reads as a background flourish rather than a
  // pasted-in sticker. `overflow: hidden` on the card does the clipping.
  // Lower opacity than on the old cream card: the same feather against deep
  // teal reads much louder, and at 0.55 it fought the name beside it.
  motif: {
    position: "absolute",
    right: -22,
    top: -18,
    width: MOTIF_COL + 76,
    height: MOTIF_COL + 76,
    opacity: 0.34,
    transform: [{ rotate: "10deg" }],
  },

  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md - 4 },
  textCol: { flex: 1, minWidth: 0 },

  // Explicit lineHeights: without them the serif and the sans have different
  // default leading and the two-line block sits optically off-centre beside
  // the avatar.
  greeting: { fontFamily: loginFonts.display, fontSize: 14, lineHeight: 19, color: colors.accent },
  name: { ...typography.h1, color: colors.onDark, marginTop: 1 },

  meta: { ...typography.caption, color: colors.onDarkMuted, marginTop: spacing.sm + 2 },

  progressBlock: { marginTop: spacing.sm + 2, gap: spacing.sm },
  progressTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressText: { ...typography.caption, color: colors.onDarkMuted, flex: 1 },
  progressCount: { fontFamily: fonts.bold, fontSize: 14, color: colors.onDark },
  track: { backgroundColor: "rgba(255, 255, 255, 0.20)", height: 7, borderRadius: 4 },
});
