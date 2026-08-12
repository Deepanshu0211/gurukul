// Design tokens. Every colour, size, radius, shadow and text style in the app
// resolves to something in this file — screens never invent their own.
//
// Surfaces are near-solid and edged with a real border. An earlier version
// leaned on translucent "glass" over the photographic background: every card,
// every field and every bar came out a slightly different pale wash of the
// same cream, and the whole interface read as one flat light-on-light sheet
// with nothing to anchor the eye. Contrast now comes from three deliberate
// levels — deep teal (headers, primary actions), white (content), tinted
// (recessed) — plus semantic colour for attendance state.

export const colors = {
  bg: "transparent",
  bgGradientTop: "#035352",
  bgGradientBottom: "transparent",

  card: "rgba(255, 255, 255, 0.96)",
  cardAlt: "#E4EFEC",
  // Sheets, dialogs and toasts sit above the scrim and must stay readable at
  // any background, so they are near-opaque rather than translucent.
  overlay: "rgba(255, 255, 255, 0.98)",
  // Bars pinned over scrolling content: tab bar, the marking screen's footer.
  bar: "rgba(255, 255, 255, 0.97)",
  // Well behind a progress fill. Ink-tinted, so it reads on the cream
  // greeting card as well as on white.
  track: "rgba(10, 43, 42, 0.10)",

  primary: "#035352",
  primaryDark: "#023B3A",
  // The dark anchor: greeting card, dashboard hero, sheet headers. Deeper than
  // `primary` so a primary-coloured button still reads as a button on top of
  // it rather than dissolving into the ground.
  primaryDeep: "#02403F",
  primarySoft: "rgba(3, 83, 82, 0.12)",

  // Cream-gold from the login artwork. Only ever used ON the deep teal — it is
  // the one warm accent, and on white it would fail contrast outright.
  accent: "#F3E8BC",
  accentDim: "rgba(243, 232, 188, 0.72)",

  text: "#0C2B2A",
  textMuted: "#4C6462", // 6.4:1 on white
  // Text sitting on primaryDeep.
  onDark: "#FFFFFF",
  onDarkMuted: "rgba(255, 255, 255, 0.76)",

  // `icon` is for decorative/affordance glyphs: chevrons, counts, grips.
  icon: "#6E8783", // 4.0:1 on white

  border: "#C2D6D1",
  // For anything that has to hold an edge against a card of the same family:
  // the segmented control's well, a search field, a table gridline.
  borderStrong: "#A5C1BB",
  divider: "rgba(10, 43, 42, 0.12)",
  // Kept as names because the bars and sheets still want a lit top edge — but
  // the sides are now a real border, not a white haze.
  hairline: "#C2D6D1",
  hairlineTop: "rgba(255, 255, 255, 0.90)",
  hairlineBottom: "#C2D6D1",

  // Semantic colours are hue-separated from the teal primary on purpose:
  // success is a warm olive-green (not another blue-green), warning a deep
  // gold, danger a wine red. On a cream ground these stay tellable apart at
  // arm's length, which plain red/green/amber over teal did not.
  // The tinted backgrounds are solid, not translucent: over a photographic
  // ground an alpha tint picked up whatever was behind it, so the same
  // "absent" chip came out pink on one screen and grey on another.
  success: "#3F6B28", // 6.2:1 on white
  successBg: "#E8F2DC",
  warning: "#8A5F04", // 5.5:1 on white
  warningBg: "#FDF0CE",
  danger: "#8E1F3C", // 8.7:1 on white
  dangerBg: "#FBE4EA",
  info: "#035352",
  infoBg: "#DDEDEA",

  scrim: "rgba(10, 43, 42, 0.42)",
  // Tint laid over a row while a finger is down. Opacity alone is easy to
  // miss in daylight on a dormitory corridor; a real colour change is not.
  pressed: "rgba(10, 43, 42, 0.07)",

  white: "#FFFFFF",
  black: "#0C2B2A",
};

export const radius = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
};

// Strict 4pt rhythm. Every margin, padding and gap in the app is one of these
// five values — mixed 7/9/11/13s were what made screens read as "almost
// aligned" rather than aligned.
export const spacing = {
  xs: 4,
  sm: 9,
  md: 16,
  lg: 24,
  xl: 32,
};

export const layout = {
  // Horizontal page gutter. Identical on every screen so titles, cards and
  // list rows share one left edge top to bottom.
  gutter: 15,
  // Android/iOS minimum interactive size. Anything smaller gets hitSlop.
  touch: 48,
  // Comfortable height for a two-line list row — above the 44 minimum,
  // because these are tapped while walking a line of students.
  row: 70,
  // Gap between the system status bar and the first thing on a page. Small on
  // purpose: the safe-area inset above it is already the clearance, and adding
  // a full 24 on top of that opened a band of empty background across the top
  // of every screen and pushed the first card down out of the reading zone.
  screenTop: 10,
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
};

// Google Sans throughout — one typeface, four weights. Note: with custom
// fonts the weight comes from `fontFamily`, NOT `fontWeight`, which silently
// does nothing on Android.
export const fonts = {
  display: "GoogleSans_700Bold",
  displayMedium: "GoogleSans_600SemiBold",
  regular: "GoogleSans_400Regular",
  medium: "GoogleSans_500Medium",
  semibold: "GoogleSans_600SemiBold",
  bold: "GoogleSans_700Bold",
};

// Login screen only. Its design was finalised on Fraunces + Manrope before the
// rest of the app standardised on Google Sans — kept deliberately separate so
// app-wide font changes never touch that screen again.
export const loginFonts = {
  display: "Fraunces_700Bold",
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

/**
 * One type scale, eight roles. Every size is on the scale
 * 11 / 12 / 13 / 14 / 15 / 17 / 21 / 28 — the half-point sizes that were
 * scattered around (14.5, 12.5, 10.5, 9.5) are what made otherwise identical
 * rows sit at different heights.
 *
 * Every role carries an explicit lineHeight. Without one, two fonts with
 * different default leading put adjacent text blocks optically off-centre.
 */
export const typography = {
  // Page title — one per screen, top left.
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.text,
  },
  h1: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.3,
    color: colors.text,
  },
  h2: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.text },
  h3: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  // Uppercase section eyebrow. Used by <SectionLabel>; don't restyle per screen.
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
};

/** Spread onto any Text showing digits that change (times, tallies, counts)
 *  so the glyph width is fixed and the row never shifts as the number ticks. */
export const numeric = { fontVariant: ["tabular-nums"] };

/**
 * Shadows are declared with the `shadow*` props only — no `elevation`.
 *
 * Under the New Architecture (Expo 57 / RN 0.86) Android honours these
 * directly, so `elevation` is both redundant and actively harmful here: it
 * renders an opaque grey drop shadow that ignores `shadowColor`, which on a
 * translucent glass surface over a photographic background reads as a dirty
 * halo rather than lift.
 */
export const shadow = {
  sm: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  md: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.11,
    shadowRadius: 16,
  },
  lg: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
  },
};
// Older call sites referred to shadow.card.
shadow.card = shadow.md;

/**
 * The three surface treatments, so a card on the Roster looks identical to a
 * card on Duties. Spread these — don't re-declare backgroundColor/borderWidth
 * per screen, which is how six slightly different whites ended up shipping.
 */
export const surface = {
  /** Default content card / list row. */
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  /** Hero elements and anything that must float above the card layer. */
  raised: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  /** Recessed containers: segmented controls, search fields, stat strips. */
  sunken: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  /**
   * The dark anchor. One or two per screen at most — the greeting card, the
   * dashboard hero. Without it every screen was white cards on a cream ground
   * and the eye had nothing to land on first.
   */
  inverse: {
    backgroundColor: colors.primaryDeep,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadow.md,
  },
};

/**
 * The greeting is the one warm, non-monochrome moment in the app — borrowed
 * from the gold of the login illustration. It now sits ON the deep teal
 * rather than on a cream card of its own: the cream version was a third pale
 * surface competing with the cards below it.
 */
export const warm = {
  bg: colors.primaryDeep,
  border: colors.primary,
  ink: colors.accent,
};

// Kept for compatibility with anything still importing them.
export const gold = colors.primary;
export const goldBg = colors.infoBg;

// Per-role tint. Role is communicated by the label text, not by colour.
export const roleAccent = {
  teacher: { bg: colors.cardAlt, fg: colors.text },
  coordinator: { bg: colors.cardAlt, fg: colors.text },
  management: { bg: colors.cardAlt, fg: colors.text },
  admin: { bg: colors.cardAlt, fg: colors.text },
  nurse: { bg: colors.cardAlt, fg: colors.text },
};
