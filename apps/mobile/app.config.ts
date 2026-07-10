import type { ExpoConfig } from "expo/config";

const baseConfig = require("./app.json") as { expo: ExpoConfig };
const localNetworkUsageDescription =
  "Yishan Mobile needs access to your local network to connect to the development server on this Mac.";
const photoLibraryUsageDescription = "Yishan needs access to your photos so you can send images to terminal agents.";
const cameraUsageDescription = "Yishan needs access to your camera so you can capture images for terminal agents.";

const config: ExpoConfig = {
  ...baseConfig.expo,
  // Keep Expo Linking deterministic and route app links through the canonical scheme.
  // Native URL types can still register additional OAuth callback schemes when needed.
  scheme: "yishan",
  ios: {
    ...baseConfig.expo.ios,
    infoPlist: {
      ...baseConfig.expo.ios?.infoPlist,
      NSCameraUsageDescription: cameraUsageDescription,
      NSLocalNetworkUsageDescription: localNetworkUsageDescription,
      NSPhotoLibraryAddUsageDescription: photoLibraryUsageDescription,
      NSPhotoLibraryUsageDescription: photoLibraryUsageDescription,
    },
  },
};

export default config;
