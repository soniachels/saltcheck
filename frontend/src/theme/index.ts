// Design System — Salt Check v2 (refined to match onboarding cards)
export const Colors = {
  // Primary brand
  pepperRed: '#C4191E',
  brightRed: '#FF0036',
  pickleLime: '#A6AE1C',
  softSpiceLilac: '#E2A9F1',
  saltBone: '#E6DCD1',

  // Darks
  inkBlack: '#0D0D0D',
  charcoal: '#161616',
  charcoalRaised: '#1F1F1F',
  darkGreen: '#363A03',
  darkerGreen: '#1B2404',

  // Grays
  steelBlueGrey: '#788794',
  mutedText: '#9A9A95',

  // System aliases
  background: '#0D0D0D',
  surface: '#161616',
  surfaceRaised: '#1F1F1F',
  surfaceLight: '#E6DCD1',
  text: '#E6DCD1',
  textSubtle: '#9A9A95',
  textDark: '#0D0D0D',
  border: '#262626',
  borderStrong: '#363A03',

  // Status
  done: '#A6AE1C',
  inProgress: '#C4191E',
  waiting: '#788794',
  parked: '#363A03',

  // Verdict colors (for Receipts advice)
  verdictTrust: '#A6AE1C',
  verdictCaution: '#E2A9F1',
  verdictCut: '#FF0036',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Typography = {
  fontFamily: {
    mono: 'SpaceMono-Regular',
    monoBold: 'SpaceMono-Bold',
  },
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 36,
    hero: 44,
  },
  lineHeight: {
    tight: 1.2,
    base: 1.5,
    loose: 1.8,
  },
};

export const BorderRadius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.37,
    shadowRadius: 7.49,
    elevation: 8,
  },
};

export const Layout = {
  screenPadding: 20,
  cardPadding: 20,
  cardPaddingLarge: 24,
  sectionGap: Spacing.lg,
  componentGap: Spacing.sm,
  buttonHeight: 52,
  inputHeight: 52,
};
