import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveDaemonProfilePath } from "./daemonEndpoint";

const DAEMON_SETTINGS_FILE_NAME = "daemon.settings.json";

type DaemonSettings = {
  quitOnExit: boolean;
};

const DEFAULTS: DaemonSettings = {
  quitOnExit: false,
};

function resolveDaemonSettingsFilePath(): string {
  return resolveDaemonProfilePath(DAEMON_SETTINGS_FILE_NAME);
}

/** Reads persisted daemon settings, returning defaults when the file is missing. */
export async function readDaemonSettings(): Promise<DaemonSettings> {
  const filePath = resolveDaemonSettingsFilePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DaemonSettings>;
    return {
      quitOnExit: typeof parsed.quitOnExit === "boolean" ? parsed.quitOnExit : DEFAULTS.quitOnExit,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persists daemon settings to disk. Creates the parent directory when needed. */
export async function writeDaemonSettings(settings: DaemonSettings): Promise<void> {
  const filePath = resolveDaemonSettingsFilePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
}

/** Reads the quit-on-exit daemon setting, returning false when unset. */
export async function getDaemonQuitOnExit(): Promise<boolean> {
  const settings = await readDaemonSettings();
  return settings.quitOnExit;
}

/** Persists the quit-on-exit daemon setting. */
export async function setDaemonQuitOnExit(value: boolean): Promise<void> {
  const settings = await readDaemonSettings();
  settings.quitOnExit = value;
  await writeDaemonSettings(settings);
}
