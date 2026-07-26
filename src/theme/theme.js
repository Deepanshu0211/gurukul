// Minimalistic light theme inspired by the reference course-app mockups.
export const colors = {
  bg: "#F4F3FB",
  bgGradientTop: "#8B85E8",
  bgGradientBottom: "#F4F3FB",
  card: "#FFFFFF",
  cardAlt: "#F6F5FC",
  primary: "#6C5CE7",
  primaryDark: "#241E4E",
  text: "#171522",
  textMuted: "#8B879C",
  border: "#ECEAF6",
  success: "#2ECC71",
  successBg: "#E9FBF0",
  warning: "#F5A623",
  warningBg: "#FFF6E5",
  danger: "#EB5757",
  dangerBg: "#FDECEC",
  info: "#5B8DEF",
  infoBg: "#EAF1FE",
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

export const typography = {
  h1: { fontSize: 26, fontWeight: "700", color: colors.text },
  h2: { fontSize: 20, fontWeight: "700", color: colors.text },
  h3: { fontSize: 16, fontWeight: "600", color: colors.text },
  body: { fontSize: 14, fontWeight: "400", color: colors.text },
  caption: { fontSize: 12, fontWeight: "400", color: colors.textMuted },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
};

export const shadow = {
  card: {
    shadowColor: "#241E4E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
};
