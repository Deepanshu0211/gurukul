import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fonts, loginFonts, warm } from "../theme/theme";
import ProgressBar from "./ProgressBar";
import Avatar from "./Avatar";
import { givenName } from "../utils/format";

// Background motif — a peacock feather rather than a depiction of Krishna,
// so no interface element is ever laid over the deity. Transparent PNG, so
// it can sit at a higher opacity than the illustration could.
const MOTIF = require("../assets/peacock-feather.png");
const MOTIF_OPACITY = 0.5;

const AVATAR_SIZE = 52;
// Strip reserved on the right for the motif; content is padded clear of it.
const MOTIF_ZONE = 92;

/**
 * Greeting card at the top of the Duties screen: profile picture, greeting,
 * name, and today's submission progress.
 *
 * Deliberately the one warm, non-monochrome surface in the app — the human
 * moment before the work starts, echoing the login illustration. Everything
 * that carries attendance data stays strictly black-and-white so colour only
 * ever means "something needs attention".
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
      <Image source={MOTIF} style={styles.motif} resizeMode="contain" pointerEvents="none" />

      {/* Content is inset from the right so nothing — text or badge — is ever
          laid over the figure in the motif. */}
      <View style={styles.content}>
        <View style={styles.row}>
          <Avatar
            name={user?.name}
            src={user?.photoUrl}
            size={AVATAR_SIZE}
            tone="warm"
            bordered
          />
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
              <Text style={styles.progressText}>
                <Text style={styles.progressCount}>{done}</Text> of {total} submitted
              </Text>
              {/* The badge belongs with the counts it describes, not floating
                  in the corner. */}
              {!!badge && <Badge {...badge} />}
            </View>
            <ProgressBar done={done} total={total} />
          </View>
        )}
      </View>
    </View>
  );
}

function Badge({ text, tone = "warning", icon }) {
  const isSuccess = tone === "success";
  const fg = isSuccess ? colors.success : colors.warning;
  return (
    <View style={[styles.badge, isSuccess ? styles.badgeSuccess : styles.badgeWarning]}>
      {!!icon && <Ionicons name={icon} size={11} color={fg} />}
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: warm.bg,
    borderWidth: 1,
    borderColor: warm.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    overflow: "hidden",
  },
  // Sits in its own column on the right, clear of all content. Rotated so the
  // quill runs into the corner and the eye reads at the top.
  motif: {
    position: "absolute",
    right:-25,
    top: +10,
    width: MOTIF_ZONE + 80,
    height: MOTIF_ZONE + 80,
    opacity: MOTIF_OPACITY,
    transform: [{ rotate: "+10deg" }],
  },
  content: { paddingRight: MOTIF_ZONE - 26 },

  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  // Left-aligned so the badge sits beside the count it describes, well clear
  // of the motif on the right rather than crowding its edge.
  progressTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  textCol: { flex: 1, minWidth: 0 },


  // Explicit lineHeights: without them the two fonts' differing default
  // leading makes the text block sit optically off-centre beside the avatar.
  greeting: {
    fontFamily: loginFonts.display,
    fontSize: 13.5,
    lineHeight: 18,
    color: warm.ink,
  },
  name: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 27,
    color: colors.text,
    letterSpacing: -0.3,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 10,
  },

  progressBlock: { marginTop: 10, gap: 6 },
  progressText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted },
  progressCount: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexShrink: 0,
  },
  badgeWarning: { backgroundColor: "#FFF4E0" },
  badgeSuccess: { backgroundColor: colors.successBg },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11 },
});
