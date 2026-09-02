import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DATA_DIRECTORY_ENVIRONMENT_VARIABLE = "YISHAN_DSH_DATA_DIR";
const DEVELOPER_MODE_ENVIRONMENT_VARIABLE = "YISHAN_DSH_DEVELOPER_MODE";
const DEFAULT_DATA_DIRECTORY = join(homedir(), ".yishan", "dsh");

/** Resolves the directory that owns Yishan DSH durable runtime data. */
export function resolveDataDirectory(
  config: { dataDirectory?: string } = {},
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return resolve(config.dataDirectory ?? environment[DATA_DIRECTORY_ENVIRONMENT_VARIABLE] ?? DEFAULT_DATA_DIRECTORY);
}

/** Returns true only for the exact daemon-provided Developer Mode environment value. */
export function isDeveloperMode(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[DEVELOPER_MODE_ENVIRONMENT_VARIABLE] === "true";
}
