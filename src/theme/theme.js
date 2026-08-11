// Minimal black-on-white theme. Neutrals carry the whole interface; the only
// colour left in the system is semantic (success / warning / danger), because
// those encode attendance state — a teacher must be able to tell "submitted"
// from "overdue" from "absent" at a glance, and flattening those to grey would
// destroy the one thing this app exists to communicate.
export const colors = {
  bg: "transparent",
  bgGradientTop: "#1C4E80",
  bgGradientBottom: "transparent",
  card: "rgba(255, 255, 255, 0.78)",
  cardAlt: "rgba(238, 244, 250, 0.72)",
  primary: "#1C4E80",
  primaryDark: "#153D66",
  text: "#0F243A",
  textMuted: "#64748B",
  border: "#E2E8F0",
  success: "#15803D",
  successBg: "#F0FDF4",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  info: "#1C4E80",
  infoBg: "#EFF6FF",
  white: "#FFFFFF",
  black: "#1C4E80",
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
};

// Tightened one step from the usual 4/8/16/24/32 scale. The app is dense,
// data-first, and read at arm's length in a hurry — generous whitespace was
// pushing content off the fold rather than aiding legibility.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 26,
};

// Google Sans throughout — one typeface, four weights. Clean, highly legible
// at small sizes, and neutral enough for a data-dense attendance screen.
// Note: with custom fonts you pick the weight via fontFamily, NOT fontWeight —
// setting fontWeight on top of a static font file does nothing on Android.
export const fonts = {
  display: "GoogleSans_700Bold",
  displayMedium: "GoogleSans_600SemiBold",
  regular: "GoogleSans_400Regular",
  medium: "GoogleSans_500Medium",
  semibold: "GoogleSans_600SemiBold",
  bold: "GoogleSans_700Bold",
};

// Login screen only. Its design was finalised on Fraunces + Manrope before
// the rest of the app standardised on Google Sans — kept deliberately
// separate so app-wide font changes never touch that screen again.
export const loginFonts = {
  display: "Fraunces_700Bold",
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

/**
 * The greeting is the one warm, human moment in an otherwise black-and-white
 * data app, so it gets its own small palette — borrowed from the cream ground
 * and gold jewellery of the login illustration, which ties the two together.
 * Used ONLY for the greeting header. Attendance data stays monochrome.
 */
export const warm = {
  bg: "#FAF6EE", // cream ground from the illustration
  border: "#EFE6D6",
  ink: "#8C6B3F", // muted gold-brown for the devotional line
};

// Kept for compatibility with anything still importing it; in the minimal
// theme this is just a neutral, not a warm accent.
export const gold = "#1C4E80";
export const goldBg = "#EFF6FF";

// Per-role tint. In the minimal theme every role shares the same neutral
// treatment — role is communicated by the label text, not by colour.
export const roleAccent = {
  teacher: { bg: colors.cardAlt, fg: colors.text },
  coordinator: { bg: colors.cardAlt, fg: colors.text },
  management: { bg: colors.cardAlt, fg: colors.text },
  admin: { bg: colors.cardAlt, fg: colors.text },
  nurse: { bg: colors.cardAlt, fg: colors.text },
};