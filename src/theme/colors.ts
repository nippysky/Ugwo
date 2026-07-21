// ─── Ụgwọ Color System ─────────────────────────────────────────────────────
// Brand: Indigo ink (#1E2A4A) · Amber (#E8A33D) · Paper (#FAF9F7) · Ink (#0E1017)
// Sibling of Akù (forest/gold) — same token structure, its own color world.
// Amber = "owed to me" · Muted red = "I owe" — used consistently everywhere.

export const Palette = {
  // Brand
  indigo:      '#1E2A4A',
  indigoLight: '#2A3A63',
  indigoMuted: '#3A4D7E',
  amber:       '#E8A33D',
  amberLight:  '#F0BC6B',
  amberMuted:  '#C58527',
  paper:       '#FAF9F7',
  ink:         '#0E1017',

  // Neutrals
  white:       '#FFFFFF',
  black:       '#000000',

  // Grays (cool-neutral scale)
  gray50:  '#F6F6F8',
  gray100: '#ECEDF1',
  gray200: '#DCDEE5',
  gray300: '#C2C5CF',
  gray400: '#94979F',
  gray500: '#666A73',
  gray600: '#464A52',
  gray700: '#31343B',
  gray800: '#1E2026',
  gray900: '#101114',

  // Semantic
  success:        '#1B7A4E',
  successLight:   '#EAF5EE',
  successMuted:   '#2A9E66',
  warning:        '#C47F00',
  warningLight:   '#FEF5E0',
  warningMuted:   '#F0A800',
  danger:         '#B5483B',   // muted red — "I owe"
  dangerLight:    '#F9ECEA',
  dangerMuted:    '#D96A5C',
  info:           '#1A6FA8',
  infoLight:      '#E8F3FB',
} as const;

export const LightColors = {
  // Backgrounds
  background:          Palette.paper,
  backgroundSecondary: Palette.gray50,
  backgroundTertiary:  Palette.gray100,
  card:                Palette.white,
  cardElevated:        Palette.white,

  // Text
  text:                '#101114',
  textSecondary:       '#53555C',
  textTertiary:        '#87898F',
  textInverse:         Palette.white,
  textOnIndigo:        Palette.paper,
  textOnAmber:         Palette.indigo,

  // Brand
  primary:             Palette.indigo,
  primaryLight:        Palette.indigoLight,
  accent:              Palette.amber,
  accentLight:         Palette.amberLight,

  // Borders
  border:              Palette.gray200,
  borderLight:         Palette.gray100,
  borderStrong:        Palette.gray300,

  // Tab bar
  tabBar:              Palette.white,
  tabBarBorder:        Palette.gray100,
  tabActive:           Palette.indigo,
  tabInactive:         Palette.gray400,

  // Inputs
  inputBackground:     Palette.gray50,
  inputBorder:         Palette.gray200,
  inputFocusBorder:    Palette.indigo,
  inputPlaceholder:    Palette.gray400,

  // Semantic
  success:             Palette.success,
  successBg:           Palette.successLight,
  warning:             Palette.warning,
  warningBg:           Palette.warningLight,
  danger:              Palette.danger,
  dangerBg:            Palette.dangerLight,

  // Debt status (Due soon / Overdue / Settled / Open)
  statusUpcoming:      Palette.warning,
  statusUpcomingBg:    Palette.warningLight,
  statusDueToday:      Palette.danger,
  statusDueTodayBg:    Palette.dangerLight,
  statusPaid:          Palette.success,
  statusPaidBg:        Palette.successLight,
  statusOverdue:       '#8B1A0E',
  statusOverdueBg:     '#FDEDEC',

  // Direction accents
  owedToMe:            Palette.amberMuted,
  owedToMeBg:          '#FBF3E4',
  iOwe:                Palette.danger,
  iOweBg:              Palette.dangerLight,

  // Overlay
  overlay:             'rgba(0,0,0,0.35)',
  overlayLight:        'rgba(0,0,0,0.12)',
  shimmer1:            Palette.gray100,
  shimmer2:            Palette.gray50,
} as const;

export const DarkColors = {
  // Backgrounds
  background:          Palette.ink,
  backgroundSecondary: '#151823',
  backgroundTertiary:  '#1C2030',
  card:                '#151823',
  cardElevated:        '#1C2030',

  // Text
  text:                '#F3F3F5',
  textSecondary:       '#A6A8B0',
  textTertiary:        '#6C6E77',
  textInverse:         '#101114',
  textOnIndigo:        Palette.paper,
  textOnAmber:         Palette.ink,

  // Brand
  primary:             Palette.indigoMuted,
  primaryLight:        '#4A5F96',
  accent:              Palette.amber,
  accentLight:         Palette.amberLight,

  // Borders
  border:              '#282B36',
  borderLight:         '#20232E',
  borderStrong:        '#383B48',

  // Tab bar
  tabBar:              '#12141D',
  tabBarBorder:        '#20232E',
  tabActive:           Palette.amber,
  tabInactive:         '#585B65',

  // Inputs
  inputBackground:     '#181B26',
  inputBorder:         '#282B36',
  inputFocusBorder:    Palette.amber,
  inputPlaceholder:    '#585B65',

  // Semantic
  success:             '#34C47A',
  successBg:           '#0D2A1A',
  warning:             '#F0B429',
  warningBg:           '#2A1E00',
  danger:              '#E5766A',
  dangerBg:            '#2A0F0B',

  // Debt status
  statusUpcoming:      '#F0B429',
  statusUpcomingBg:    '#2A1E00',
  statusDueToday:      '#E5766A',
  statusDueTodayBg:    '#2A0F0B',
  statusPaid:          '#34C47A',
  statusPaidBg:        '#0D2A1A',
  statusOverdue:       '#FF6B6B',
  statusOverdueBg:     '#3A0D0A',

  // Direction accents
  owedToMe:            Palette.amber,
  owedToMeBg:          '#2A2010',
  iOwe:                '#E5766A',
  iOweBg:              '#2A0F0B',

  // Overlay
  overlay:             'rgba(0,0,0,0.6)',
  overlayLight:        'rgba(0,0,0,0.3)',
  shimmer1:            '#1C2030',
  shimmer2:            '#151823',
} as const;

export type ColorScheme = typeof LightColors;
