import type { ExpoConfig } from "expo/config";

const baseConfig = require("./app.json") as { expo: ExpoConfig };
const localNetworkUsageDescription =
  "Yishan Mobile needs access to your local network to connect to the development server on this Mac.";
const appScheme = "yishan";

function normalizeScheme(value: string | undefined): string {
  return value?.trim().replace(/:\/?\/?$/, "") ?? "";
}

function buildRegisteredSchemes(): string[] {
  return Array.from(
    new Set([appScheme, normalizeScheme(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME)].filter(Boolean)),
  );
}

const config: ExpoConfig = {
  ...baseConfig.expo,
  // Keep Expo Linking deterministic and route app links through the canonical scheme.
  // Native URL types can still register additional OAuth callback schemes when needed.
  scheme: buildRegisteredSchemes(),
  ios: {
    ...baseConfig.expo.ios,
    infoPlist: {
      ...baseConfig.expo.ios?.infoPlist,
      NSLocalNetworkUsageDescription: localNetworkUsageDescription,
    },
  },
};

export default config;
