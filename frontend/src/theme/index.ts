// Design System based on Salt Check brand guidelines
export const Colors = {
  // Primary
  pepperRed: '#C4191E',
  brightRed: '#FF0036',
  pickleLime: '#A6AE1C',
  softSpiceLilac: '#E2A9F1',
  saltBone: '#E6DCD1',
  
  // Darks
  inkBlack: '#0D0D0D',
  charcoal: '#1A1A1A',
  darkGreen: '#363A03',
  darkerGreen: '#1B2404',
  
  // Grays
  steelBlueGrey: '#788794',
  
  // System
  background: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceLight: '#E6DCD1',
  text: '#E6DCD1',
  textDark: '#0D0D0D',
  border: '#363A03',
  
  // Status
  done: '#A6AE1C',
  inProgress: '#C4191E',
  waiting: '#788794',
  parked: '#363A03',
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
  // Using Space Mono as the main font
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
    hero: 44,
  },
  
  lineHeight: {
    tight: 1.2,
    base: 1.5,
    loose: 1.8,
  },
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
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
    shadowOpacity: 0.30,
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

// Layout constants
export const Layout = {
  screenPadding: Spacing.md,
  cardPadding: Spacing.md,
  sectionGap: Spacing.lg,
  componentGap: Spacing.sm,
  buttonHeight: 48,
  inputHeight: 48,
};
