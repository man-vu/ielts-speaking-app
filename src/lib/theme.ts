/** "Examination hall, after dark" — deep ink surfaces, cream ink, brass
 *  accents, stamp red for live/destructive states. Chart marks use the
 *  dataviz-validated amber (#B5851F on dark surfaces), while text always
 *  wears ink tokens, never the series color. */
export const theme = {
  bg: "#0E1120",
  card: "#171B30",
  cardRaised: "#1D2340",
  border: "#2A3052",
  borderSoft: "#232946",

  ink: "#F2EADA",
  inkSecondary: "#A7ABC4",
  inkMuted: "#6E7492",

  brass: "#C9A35C",
  chartAmber: "#B5851F",
  stampRed: "#D25353",
  live: "#4FA97C",
  info: "#7A9BD8",

  fontDisplay: "Fraunces_600SemiBold",
  fontDisplayBold: "Fraunces_700Bold",
  fontMono: "IBMPlexMono_500Medium",
  fontMonoBold: "IBMPlexMono_600SemiBold",
} as const;

/** Small-caps section label style, shared across screens. */
export const overline = {
  color: theme.inkMuted,
  fontSize: 11,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};
