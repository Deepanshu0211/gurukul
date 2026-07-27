// Minimal black-on-white theme. Neutrals carry the whole interface; the only
// colour left in the system is semantic (success / warning / danger), because
// those encode attendance state — a teacher must be able to tell "submitted"
// from "overdue" from "absent" at a glance, and flattening those to grey would
// destroy the one thing this app exists to communicate.
export const colors = {
  bg: "#FFFFFF",
  bgGradientTop: "#1A1A1A",
  bgGradientBottom: "#FFFFFF",
  card: "#FFFFFF",
  cardAlt: "#F5F5F5",
  primary: "#111111",
  primaryDark: "#000000",
  text: "#0A0A0A",
  textMuted: "#737373",
  border: "#E5E5E5",
  success: "#15803D",
  successBg: "#F0FDF4",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  info: "#1D4ED8",
  infoBg: "#EFF6FF",
  white: "#FFFFFF",
  black: "#000000",
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// Fraunces — a soft, characterful serif — carries headings and the brand.
// Manrope handles everything functional: UI labels, body copy, and numbers
// (it has even, legible digits, which matters on the attendance counts).
// Note: with custom fonts you pick the weight via fontFamily, NOT fontWeight —
// setting fontWeight on top of a static font file does nothing on Android.
export const fonts = {
  display: "Fraunces_700Bold",
  displayMedium: "Fraunces_600SemiBold",
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

export const typography = {
  h1: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  h3: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.1,
  },
};

// Cards are white on a white ground, so they're defined by a hairline border
// (see components/ui.js) rather than by shadow. Kept very subtle.
export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
};

// Kept for compatibility with anything still importing it; in the minimal
// theme this is just a neutral, not a warm accent.
export const gold = "#111111";
export const goldBg = "#F5F5F5";

// Per-role tint. In the minimal theme every role shares the same neutral
// treatment — role is communicated by the label text, not by colour.
export const roleAccent = {
  teacher: { bg: colors.cardAlt, fg: colors.text },
  coordinator: { bg: colors.cardAlt, fg: colors.text },
  management: { bg: colors.cardAlt, fg: colors.text },
  admin: { bg: colors.cardAlt, fg: colors.text },
  nurse: { bg: colors.cardAlt, fg: colors.text },
};