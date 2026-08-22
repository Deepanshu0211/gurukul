import React from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isOffline, OFFLINE_TITLE, OFFLINE_BODY } from "../lib/errors";
import {
  colors,
  radius,
  spacing,
  typography,
  shadow,
  surface,
  layout,
  fonts,
  numeric,
} from "../theme/theme";

/**
 * Shared building blocks. Anything that appears on two or more screens lives
 * here so it can only look one way — the previous per-screen copies of the
 * same card, divider and section header were the main source of the app
 * looking subtly misaligned from screen to screen.
 */

export function Card({ style, children, tone = "card", ...rest }) {
  return (
    <View style={[styles.card, surface[tone], style]} {...rest}>
      {children}
    </View>
  );
}

export function Pill({ label, tone = "neutral", icon, style }) {
  const tones = {
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warning },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    info: { bg: colors.infoBg, fg: colors.info },
    neutral: { bg: colors.cardAlt, fg: colors.textMuted },
    primary: { bg: colors.primarySoft, fg: colors.primary },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      {!!icon && <Ionicons name={icon} size={12} color={t.fg} />}
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * Where one duty stands: Pending / Due now / Overdue / Submitted.
 *
 * A pill alone was not enough — on a list of ten checkpoints a teacher was
 * reading the words to tell two states apart. This carries three signals at
 * once: a filled dot, a tinted ground, and the word, so the state is legible
 * from the shape of the row before any of it is actually read. Uppercase and
 * tracked, because these are labels for a state, not sentences.
 *
 *   <StatusTag tone="submitted" />        // default label per tone
 *   <StatusTag tone="overdue" label="Overdue by 12m" />
 */
const STATUS_TONES = {
  submitted: { bg: colors.successBg, fg: colors.success, label: "Submitted" },
  due: { bg: colors.warningBg, fg: colors.warning, label: "Due now" },
  overdue: { bg: colors.dangerBg, fg: colors.danger, label: "Overdue" },
  pending: { bg: colors.cardAlt, fg: colors.textMuted, label: "Pending" },
};

export function StatusTag({ tone = "pending", label, style }) {
  const t = STATUS_TONES[tone] || STATUS_TONES.pending;
  return (
    <View style={[styles.statusTag, { backgroundColor: t.bg, borderColor: t.fg }, style]}>
      <View style={[styles.statusDot, { backgroundColor: t.fg }]} />
      <Text style={[styles.statusTagText, { color: t.fg }]} numberOfLines={1}>
        {(label || t.label).toUpperCase()}
      </Text>
    </View>
  );
}

export function PrimaryButton({ title, icon, onPress, disabled, style, textStyle, ...rest }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.85}
      style={[styles.primaryBtn, disabled && styles.btnDisabled, style]}
      {...rest}
    >
      <Text style={[styles.primaryBtnText, textStyle]}>{title}</Text>
      {!!icon && <Ionicons name={icon} size={16} color={colors.white} />}
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, onPress, disabled, style, ...rest }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.7}
      style={[styles.secondaryBtn, disabled && styles.btnDisabled, style]}
      {...rest}
    >
      <Text style={styles.secondaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

/** Small text action ("Edit", "+ Add"). Padded to a 44pt target rather than
 *  relying on hitSlop, so neighbouring rows can't steal the tap. */
export function TextAction({ label, onPress, accessibilityLabel, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      activeOpacity={0.6}
      style={[styles.textAction, style]}
    >
      <Text style={styles.textActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconCircle({ children, bg = colors.cardAlt, size = 48 }) {
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
        borderColor: colors.hairline,
      }}
    >
      {children}
    </View>
  );
}

/**
 * The uppercase eyebrow above a group of rows, with an optional count and an
 * optional trailing action. One component so the letter-spacing, size and the
 * space it reserves above/below are identical on every screen.
 */
export function SectionLabel({ children, count, action, tone, style }) {
  // The count is the thing a coordinator scans for, so on a toned section it
  // becomes a filled chip rather than a grey number lost in the eyebrow.
  const t = tone ? STATUS_TONES[tone] : null;
  return (
    <View style={[styles.sectionLabelRow, style]}>
      {!!t && <View style={[styles.sectionDot, { backgroundColor: t.fg }]} />}
      <Text style={[typography.label, !!t && { color: t.fg }]}>
        {String(children).toUpperCase()}
      </Text>
      {count != null &&
        (t ? (
          <View style={[styles.sectionChip, { backgroundColor: t.bg }]}>
            <Text style={[styles.sectionChipText, { color: t.fg }]}>{count}</Text>
          </View>
        ) : (
          <Text style={styles.sectionCount}>{count}</Text>
        ))}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

/** The affordance chevron on a tappable row. Fixed size and colour so rows
 *  end at the same optical right edge everywhere. */
export function Chevron({ color = colors.icon }) {
  return <Ionicons name="chevron-forward" size={18} color={color} />;
}

/**
 * A tappable list row with real press feedback.
 *
 * `TouchableOpacity`'s fade alone is easy to miss on a bright corridor screen,
 * and it gives nothing on Android where a ripple is expected. This dims AND
 * ripples, so a teacher knows the tap registered without watching for it.
 * Pass the row's own visual style; only the pressed state is supplied here.
 */
export function Row({ style, children, onPress, disabled, ...rest }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.pressed, borderless: false }}
      style={({ pressed }) => [style, pressed && styles.rowPressed]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

/**
 * Divider between rows inside a grouped container.
 *
 * `inset` must equal the row's left padding plus the width of whatever leads
 * the row (icon, avatar) plus its gap — otherwise the line starts at a
 * different x than the text above and below it, which reads as a wobble down
 * the whole group.
 */
export function Divider({ inset = 0 }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

/** Big number over a small label. Used by the dashboard and account stat rows. */
export function Stat({ value, label, tone }) {
  const color = tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Centred icon + title + body. Every empty and error state uses this, so
 *  they share one vertical rhythm and one measure. */
export function EmptyState({ icon, title, body, action, compact }) {
  return (
    <View style={[styles.empty, compact && { paddingVertical: spacing.xl }]}>
      {!!icon && <Ionicons name={icon} size={28} color={colors.icon} />}
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!body && <Text style={styles.emptyBody}>{body}</Text>}
      {action}
    </View>
  );
}

/**
 * The whole-screen "we could not load this" state.
 *
 * One component for every screen's load failure, because they used to say
 * five different things and three of them printed the raw error — which on a
 * corridor with no signal is a Java stack trace with the database hostname in
 * it. Offline gets a broken-cloud mark, plain words and a Retry, since that is
 * the failure this app will actually meet and it has an obvious remedy.
 *
 * Anything else keeps its own wording, because "check your wi-fi" is useless
 * advice for a problem that is not the wi-fi.
 */
export function ErrorState({ error, title, onRetry, compact }) {
  const offline = isOffline(error);
  return (
    <EmptyState
      compact={compact}
      icon={offline ? "cloud-offline-outline" : "alert-circle-outline"}
      title={offline ? OFFLINE_TITLE : title || "Something went wrong"}
      body={offline ? OFFLINE_BODY : undefined}
      action={
        onRetry ? (
          <SecondaryButton
            title="Try again"
            onPress={onRetry}
            style={{ marginTop: spacing.md }}
          />
        ) : null
      }
    />
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[typography.h2, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
  },

  // Transform, not width/height — it can't reflow the list mid-scroll. The
  // scale is deliberately small but the dim is not: on a bright corridor
  // screen the 0.5% squeeze alone was invisible.
  rowPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  pillText: { fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold },

  primaryBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: layout.touch,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    minHeight: layout.touch,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  secondaryBtnText: { color: colors.text, fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold },
  btnDisabled: { opacity: 0.45 },

  textAction: {
    minHeight: layout.touch,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginRight: -spacing.sm, // keeps the label flush with the container edge
  },
  textActionLabel: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.primary },

  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 20,
  },
  sectionCount: { ...typography.label, letterSpacing: 0, color: colors.icon },
  sectionDot: { width: 7, height: 7, borderRadius: 4, marginRight: -spacing.xs },
  sectionChip: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  sectionChipText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 15, ...numeric },

  // Outlined, not just tinted: a pale fill alone disappeared against the pale
  // card it sat on. The 1pt edge in the tone's own colour is what makes the
  // tag read as a discrete object at arm's length.
  statusTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTagText: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 14, letterSpacing: 0.7 },

  divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.divider },

  stat: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xs },
  statValue: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 27, ...numeric },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    marginTop: 2,
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.h2, textAlign: "center", marginTop: spacing.xs },
  emptyBody: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
  },
});
