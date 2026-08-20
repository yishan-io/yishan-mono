import {
  EXTERNAL_APP_PRESETS,
  type ExternalAppId,
  findExternalAppPreset,
  getExternalAppDetectionKeys,
  isExternalAppPlatformSupported,
  isExternalAppPresetSupportedOnPlatform,
  normalizeExternalAppPlatform,
} from "../../shared/contracts/externalApps";
import { runCommandForExitCode } from "../clipboard/process";

/** Builds platform-specific command candidates used to detect one installed external app preset. */
function buildExternalAppDetectionCommandCandidates(appId: ExternalAppId): string[][] {
  const normalizedPlatform = normalizeExternalAppPlatform(process.platform);
  const detectionKeys = getExternalAppDetectionKeys(appId, normalizedPlatform);

  if (normalizedPlatform === "darwin") {
    return detectionKeys.map((appName) => ["open", "-Ra", appName]);
  }

  if (normalizedPlatform === "linux") {
    return detectionKeys.map((commandName) => ["which", commandName]);
  }

  return [];
}

/** Builds platform-specific command candidates used to launch one path in one external app preset. */
function buildExternalAppCommandCandidates(path: string, appId: ExternalAppId): string[][] {
  const appPreset = findExternalAppPreset(appId);
  if (!appPreset) {
    throw new Error("Unsupported external app");
  }

  if (
    !isExternalAppPlatformSupported(process.platform) ||
    !isExternalAppPresetSupportedOnPlatform(appId, process.platform)
  ) {
    throw new Error("Opening workspace entries in external apps is not supported on this platform yet");
  }

  if (process.platform === "darwin") {
    return appPreset.darwinAppNames.map((appName) => ["open", "-a", appName, path]);
  }

  return appPreset.linuxCommands.map((commandName) => [commandName, path]);
}

/** Lists installed external-app ids that can be launched on the current host OS. */
export async function listDetectedExternalAppIds(): Promise<ExternalAppId[]> {
  if (!isExternalAppPlatformSupported(process.platform)) {
    return [];
  }

  const detectionResults = await Promise.all(
    EXTERNAL_APP_PRESETS.map(async (appPreset) => {
      for (const command of buildExternalAppDetectionCommandCandidates(appPreset.id)) {
        const exitCode = await runCommandForExitCode(command);
        if (exitCode === 0) {
          return appPreset.id;
        }
      }

      return null;
    }),
  );

  return detectionResults.filter((appId): appId is ExternalAppId => appId !== null);
}

/** Opens one path in one selected external app preset using platform-specific launch commands. */
export async function launchExternalApp(path: string, appId: ExternalAppId): Promise<void> {
  const appPreset = findExternalAppPreset(appId);
  if (!appPreset) {
    throw new Error("Unsupported external app");
  }

  for (const command of buildExternalAppCommandCandidates(path, appId)) {
    const exitCode = await runCommandForExitCode(command);
    if (exitCode === 0) {
      return;
    }
  }

  throw new Error(`Failed to open path in ${appPreset.label}`);
}
