import { createAnimations } from "@tamagui/animations-react-native";
import { shorthands } from "@tamagui/shorthands/v5";
import { defaultThemes, tokens } from "@tamagui/themes/v5";
import { createFont, createTamagui } from "tamagui";

import { appThemes } from "./src/lib/theme/tamaguiThemes";

const animations = createAnimations({
  "100ms": {
    type: "timing",
    duration: 100,
  },
  bouncy: {
    damping: 9,
    mass: 0.9,
    stiffness: 150,
  },
  lazy: {
    damping: 18,
    stiffness: 50,
  },
  medium: {
    damping: 15,
    stiffness: 120,
    mass: 1,
  },
  slow: {
    damping: 15,
    stiffness: 40,
  },
  quick: {
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  tooltip: {
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
});

const bodyFont = createFont({
  family: "System",
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    true: 14,
    5: 16,
    6: 18,
    7: 20,
    8: 23,
    9: 30,
    10: 46,
    11: 55,
    12: 62,
    13: 72,
    14: 92,
    15: 114,
    16: 134,
  },
  lineHeight: {
    1: 21,
    2: 22,
    3: 23,
    4: 24,
    true: 24,
    5: 26,
    6: 28,
    7: 30,
    8: 33,
    9: 40,
    10: 56,
    11: 65,
    12: 72,
    13: 82,
    14: 102,
    15: 124,
    16: 144,
  },
  weight: {
    4: "300",
  },
  letterSpacing: {
    4: 0,
  },
});

const headingFont = createFont({
  family: "System",
  size: {
    1: 15,
    2: 16.8,
    3: 18.2,
    4: 19.6,
    true: 19.6,
    5: 22.4,
    6: 25.2,
    7: 28,
    8: 32.2,
    9: 42,
    10: 64.4,
    11: 77,
    12: 86.8,
    13: 100.8,
    14: 128.8,
    15: 159.6,
    16: 187.6,
  },
  lineHeight: {
    1: 25,
    2: 26.8,
    3: 28.2,
    4: 29.6,
    true: 29.6,
    5: 32.4,
    6: 35.2,
    7: 38,
    8: 42.2,
    9: 52,
    10: 74.4,
    11: 87,
    12: 96.8,
    13: 110.8,
    14: 138.8,
    15: 169.6,
    16: 197.6,
  },
  weight: {
    4: "300",
  },
  letterSpacing: {
    4: 0,
  },
});

export const tamaguiConfig = createTamagui({
  animations,
  media: {
    maxXs: { maxWidth: 460 },
    max2xs: { maxWidth: 340 },
    maxSm: { maxWidth: 640 },
    maxMd: { maxWidth: 768 },
    maxLg: { maxWidth: 1024 },
    maxXl: { maxWidth: 1280 },
    max2Xl: { maxWidth: 1536 },
    "2xl": { minWidth: 1536 },
    xl: { minWidth: 1280 },
    lg: { minWidth: 1024 },
    md: { minWidth: 768 },
    sm: { minWidth: 640 },
    xs: { minWidth: 460 },
    "2xs": { minWidth: 340 },
    phone: { maxWidth: 767 },
    tablet: { minWidth: 768, maxWidth: 1023 },
    desktop: { minWidth: 1024 },
  },
  shorthands,
  themes: appThemes,
  tokens,
  fonts: {
    body: bodyFont,
    heading: headingFont,
  },
  selectionStyles: (theme) =>
    theme.color5
      ? {
          backgroundColor: theme.color5,
          color: theme.color11,
        }
      : null,
  settings: {
    mediaQueryDefaultActive: {
      "2xl": false,
      xl: false,
      lg: false,
      md: false,
      sm: false,
      xs: true,
      "2xs": true,
    },
    defaultFont: "body",
    fastSchemeChange: true,
    shouldAddPrefersColorThemes: true,
    allowedStyleValues: "somewhat-strict-web",
    themeClassNameOnRoot: true,
    onlyAllowShorthands: true,
    maxDarkLightNesting: 2,
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
