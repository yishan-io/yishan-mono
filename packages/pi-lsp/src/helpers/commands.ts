/**
 * Command resolution and process-environment helpers for launching language
 * servers.
 */
import { constants, accessSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import type { ServerCommand } from "../types";

/**
 * Returns whether a command is executable on PATH or relative to cwd.
 */
export function isCommandAvailable(
  command: string,
  cwd = process.cwd(),
  pathValue = effectivePath(undefined, process.platform),
): boolean {
  return resolveExecutable(command, cwd, process.platform, pathValue) !== undefined;
}

/**
 * Returns the effective PATH: the server env override when present,
 * otherwise the process environment.
 */
export function effectivePath(
  env: Record<string, string> | undefined,
  platform: NodeJS.Platform = process.platform,
): string {
  return envValue(env, "PATH", platform) ?? envValue(process.env, "PATH", platform) ?? "";
}

/**
 * Builds the child-process environment: the process environment with the
 * server overrides applied (case-insensitively on Windows).
 */
export function mergeEnv(
  overrides: Record<string, string> | undefined,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (platform === "win32") {
      for (const existingKey of Object.keys(environment)) {
        if (existingKey.toLowerCase() === key.toLowerCase()) delete environment[existingKey];
      }
    }
    environment[key] = value;
  }
  return environment;
}

/**
 * Rewrites a Windows .bat/.cmd command into a cmd.exe invocation; other
 * commands pass through unchanged.
 */
export function resolveSpawnCommand(
  command: ServerCommand,
  platform: NodeJS.Platform = process.platform,
  comSpec = process.env.ComSpec,
): ServerCommand {
  if (platform !== "win32" || !/\.(?:bat|cmd)$/i.test(command.command)) return command;
  return {
    command: comSpec?.trim() || "cmd.exe",
    args: ["/d", "/s", "/c", command.command, ...command.args],
  };
}

/**
 * Resolves a command to an executable path: absolute/relative paths are
 * checked directly; bare names are searched across PATH. Returns undefined
 * when nothing runnable matches.
 */
export function resolveExecutable(
  command: string,
  cwd = process.cwd(),
  platform: NodeJS.Platform = process.platform,
  pathValue = process.env.PATH ?? "",
): string | undefined {
  const extensions = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  if (command.includes("/") || command.includes("\\")) {
    const commandPath = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    return findRunnable(commandPath, extensions, platform);
  }

  for (const directory of pathValue.split(platform === "win32" ? ";" : ":")) {
    const resolved = findRunnable(path.resolve(cwd, directory || ".", command), extensions, platform);
    if (resolved) return resolved;
  }
  return undefined;
}

/**
 * Returns the first extension-suffixed candidate that is a runnable file.
 */
function findRunnable(filePath: string, extensions: string[], platform: NodeJS.Platform) {
  for (const extension of extensions) {
    const candidate = `${filePath}${extension}`;
    if (isRunnable(candidate, platform)) return candidate;
  }
  return undefined;
}

/**
 * Returns whether a path is a file and, on non-Windows platforms,
 * executable.
 */
function isRunnable(filePath: string, platform: NodeJS.Platform): boolean {
  if (!existsSync(filePath)) return false;
  try {
    if (!statSync(filePath).isFile()) return false;
    if (platform !== "win32") accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Case-insensitive lookup of one variable in an environment map.
 */
function envValue(
  environment: NodeJS.ProcessEnv | Record<string, string> | undefined,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== "win32") return environment?.[name];
  for (const [key, candidate] of Object.entries(environment ?? {})) {
    if (key.toLowerCase() === name.toLowerCase()) return candidate;
  }
  return undefined;
}
