// Design tokens — "paper & ink" editorial system with a single signal colour.
export type Scheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  paper: string; // canvas / photo backdrop
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkSoft: string;
  muted: string;
  faint: string;
  line: string;
  lineStrong: string;
  signal: string; // AI moments & active states
  signalInk: string;
  success: string;
  danger: string;
  shadow: string;
  overlay: string;
  grainOpacity: number;
}

export const palettes: Record<Scheme, Palette> = {
  light: {
    bg: '#F2F0EB',
    paper: '#ECE9E2',
    surface: '#F8F7F3',
    surfaceAlt: '#E6E2D9',
    ink: '#111111',
    inkSoft: '#2C2B29',
    muted: '#8A867D',
    faint: '#B9B4AA',
    line: '#DCD8CF',
    lineStrong: '#C4BFB4',
    signal: '#FF4D00',
    signalInk: '#FFFFFF',
    success: '#2F6B45',
    danger: '#B8322E',
    shadow: '#3A3025',
    overlay: 'rgba(17,17,17,0.42)',
    grainOpacity: 0.05,
  },
  dark: {
    bg: '#0E0E0D',
    paper: '#161615',
    surface: '#151514',
    surfaceAlt: '#1E1E1C',
    ink: '#EDEBE6',
    inkSoft: '#D5D2CB',
    muted: '#7F7B73',
    faint: '#4F4C47',
    line: '#262624',
    lineStrong: '#3A3936',
    signal: '#FF5A14',
    signalInk: '#0E0E0D',
    success: '#6FBF8B',
    danger: '#E2605A',
    shadow: '#000000',
    overlay: 'rgba(0,0,0,0.6)',
    grainOpacity: 0.07,
  },
};

export const fonts = {
  display: 'Anton_400Regular',
  sans: 'InterTight_400Regular',
  sansMedium: 'InterTight_500Medium',
  sansSemi: 'InterTight_600SemiBold',
  sansBold: 'InterTight_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { none: 0, xs: 2, sm: 4, md: 8, pill: 999 } as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 52, lineHeight: 54, letterSpacing: -0.5, textTransform: 'uppercase' as const },
  displaySm: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.2, textTransform: 'uppercase' as const },
  title: { fontFamily: fonts.sansSemi, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.sansSemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.monoMedium, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  editorial: { fontFamily: fonts.serifItalic, fontSize: 26, lineHeight: 29, letterSpacing: -0.2 },
  editorialSm: { fontFamily: fonts.serifItalic, fontSize: 19, lineHeight: 22 },
} as const;

export type TypeVariant = keyof typeof type;

export const motion = {
  spring: { damping: 18, stiffness: 180, mass: 1 },
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
  springSnappy: { damping: 16, stiffness: 320, mass: 0.8 },
  springBouncy: { damping: 11, stiffness: 160, mass: 0.9 },
} as const;
