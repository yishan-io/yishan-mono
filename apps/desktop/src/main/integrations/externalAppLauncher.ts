import { runCommandForExitCode } from "./process";
import { shell } from "electron";
import {
  type ExternalAppId,
  findExternalAppPreset,
  isExternalAppPlatformSupported,
} from "../../shared/contracts/externalApps";
import type { OpenExternalUrlResult } from "../ipc";

export type LaunchPathInput =
  | {
      kind: "system-file-manager";
      path: string;
      isDirectory: boolean;
    }
  | {
      kind: "external-app";
      path: string;
      appId: ExternalAppId;
    };

const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set<string>(["http:", "https:", "mailto:"]);

/** Opens one file path in its containing folder or one directory path in the host file manager. */
async function launchInFileManager(path: string, isDirectory: boolean): Promise<void> {
  if (!isDirectory) {
    shell.showItemInFolder(path);
    return;
  }

  const openError = await shell.openPath(path);
  if (openError) {
    throw new Error(openError);
  }
}

/** Builds platform-specific command candidates used to launch one path in one external app preset. */
function buildExternalAppCommandCandidates(path: string, appId: ExternalAppId): string[][] {
  const appPreset = findExternalAppPreset(appId);
  if (!appPreset) {
    throw new Error("Unsupported external app");
  }

  if (!isExternalAppPlatformSupported(process.platform)) {
    throw new Error("Opening workspace entries in external apps is not supported on this platform yet");
  }

  if (process.platform === "darwin") {
    return appPreset.darwinAppNames.map((appName) => ["open", "-a", appName, path]);
  }

  return appPreset.linuxCommands.map((commandName) => [commandName, path]);
}

/** Opens one path in one selected external app preset using platform-specific launch commands. */
async function launchInExternalApp(path: string, appId: ExternalAppId): Promise<void> {
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

/** Launches one path via either host file manager integration or external app integration. */
export async function launchPath(input: LaunchPathInput): Promise<void> {
  if (input.kind === "system-file-manager") {
    await launchInFileManager(input.path, input.isDirectory);
    return;
  }

  await launchInExternalApp(input.path, input.appId);
}

/** Returns one normalized URL object when a candidate string parses successfully. */
function parseExternalUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Returns true when one parsed URL protocol is allowed for desktop external opening. */
function isAllowedExternalUrlProtocol(protocol: string): boolean {
  return ALLOWED_EXTERNAL_URL_PROTOCOLS.has(protocol);
}

/** Opens one validated external URL through the Electron shell integration. */
export async function openExternalUrl(url: string): Promise<OpenExternalUrlResult> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return { opened: false, reason: "invalid-url" };
  }

  const parsedUrl = parseExternalUrl(trimmedUrl);
  if (!parsedUrl) {
    return { opened: false, reason: "invalid-url" };
  }

  if (!isAllowedExternalUrlProtocol(parsedUrl.protocol)) {
    return { opened: false, reason: "unsupported-protocol" };
  }

  try {
    await shell.openExternal(parsedUrl.toString());
    return { opened: true };
  } catch {
    return { opened: false, reason: "open-failed" };
  }
}
