/**
 * pi-lsp configuration loading and normalization.
 *
 * Resolution order: trusted project `<workspace>/.pi/lsp.json` → user
 * `<agent dir>/lsp.json` → the built-in catalog.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

import type { LspConfig, NamedServer, ResolvedServer } from "../types";
import { COMMON_SKIP_DIRECTORIES, DEFAULT_SERVERS, LANGUAGE_IDS } from "./catalog";

/**
 * Default request timeout in milliseconds when the config sets none.
 */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Options controlling config resolution for one load.
 */
export interface ConfigLoadOptions {
  projectTrusted?: boolean;
}

/**
 * The resolved runtime: runnable server bindings plus the request timeout.
 */
export interface LspRuntime {
  servers: ResolvedServer[];
  timeoutMs: number;
}

/**
 * Loads the effective runtime for a cwd: server bindings and timeout.
 */
export function loadRuntime(cwd = process.cwd(), options: ConfigLoadOptions = {}): LspRuntime {
  const config = loadConfig(cwd, options);
  return {
    servers: config.servers.map(bindServer),
    timeoutMs: config.timeout ?? DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Loads the effective config: trusted project config, then user config,
 * then the built-in default catalog.
 */
export function loadConfig(cwd = process.cwd(), options: ConfigLoadOptions = {}): LspConfig {
  const found = findConfiguredConfig(cwd, options.projectTrusted === true);
  return (
    found ?? {
      servers: DEFAULT_SERVERS.map((server) => ({ ...server, isDefault: true })),
    }
  );
}

/**
 * Looks for a configured (non-default) config, honoring project trust.
 */
function findConfiguredConfig(cwd: string, projectTrusted: boolean): LspConfig | undefined {
  if (projectTrusted) {
    const projectConfig = readConfigIfPresent(path.join(cwd, CONFIG_DIR_NAME, "lsp.json"));
    if (projectConfig) return projectConfig;
  }
  return readConfigIfPresent(path.join(getAgentDir(), "lsp.json"));
}

/**
 * Parses a config file when present, treating a missing file as absent.
 */
function readConfigIfPresent(filePath: string): LspConfig | undefined {
  if (!existsSync(filePath)) return undefined;
  return parseConfigFile(filePath);
}

/**
 * Parses and normalizes one config file, throwing on invalid content.
 */
function parseConfigFile(filePath: string): LspConfig {
  return normalizeConfig(JSON.parse(readFileSync(filePath, "utf8")), filePath);
}

/**
 * Normalizes a parsed config value, accepting the wrapper shape
 * ({ timeout, servers }) or a bare server map.
 */
function normalizeConfig(value: unknown, label: string): LspConfig {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);

  if ("servers" in value) {
    const servers = value.servers;
    if (!isRecord(servers) || Array.isArray(servers)) {
      throw new Error(`${label}.servers must be an object mapping server names to config.`);
    }
    return {
      timeout: normalizeTimeout(value.timeout, label),
      servers: normalizeServerMap(servers, `${label}.servers`),
    };
  }

  if ("timeout" in value) {
    throw new Error(`${label}.timeout requires the wrapper shape with a servers object.`);
  }

  if (isServerEntry(value)) {
    throw new Error(
      `${label} looks like a single server entry. Use the wrapper shape { "servers": { "<name>": { "command": [...], "extensions": [...] } } }.`,
    );
  }

  return { servers: normalizeServerMap(value, label) };
}

/**
 * Normalizes a name-to-server map into named server entries.
 */
function normalizeServerMap(value: Record<string, unknown>, label: string): NamedServer[] {
  return Object.entries(value).map(([name, entry]) => normalizeServer(name, entry, `${label}.${name}`));
}

/**
 * Returns whether a value looks like a single server entry rather than a
 * map of server names.
 */
function isServerEntry(value: unknown) {
  return isRecord(value) && (Array.isArray(value.command) || Array.isArray(value.extensions));
}

/**
 * Normalizes one server entry, validating each field's shape.
 */
function normalizeServer(name: string, value: unknown, label: string): NamedServer {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const command = requireStringArray(value.command, `${label}.command`);
  if (command.length === 0) throw new Error(`${label}.command must contain at least one string.`);
  return {
    name,
    command,
    extensions: requireStringArray(value.extensions, `${label}.extensions`).map(withLeadingDot),
    env: optionalStringMap(value.env, `${label}.env`),
    initialization: optionalRecord(value.initialization, `${label}.initialization`),
    skipDirectories: optionalDirectoryNames(value.skipDirectories, `${label}.skipDirectories`),
    diagnosticsSettleMs: optionalPositiveNumber(value.diagnosticsSettleMs, `${label}.diagnosticsSettleMs`),
    pushDiagnosticsGraceMs: optionalPositiveNumber(value.pushDiagnosticsGraceMs, `${label}.pushDiagnosticsGraceMs`),
    pullDiagnosticsGraceMs: optionalPositiveNumber(value.pullDiagnosticsGraceMs, `${label}.pullDiagnosticsGraceMs`),
  };
}

/**
 * Validates the global timeout, returning undefined when absent.
 */
function normalizeTimeout(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}.timeout must be a positive number.`);
  }
  return value;
}

/**
 * Binds a named server into a runnable ResolvedServer.
 */
export function bindServer(config: NamedServer): ResolvedServer {
  const extensions = new Set(config.extensions.map(withLeadingDot));
  const [command, ...args] = config.command;
  if (!command) throw new Error(`${config.name}.command must contain at least one string.`);
  return {
    name: config.name,
    isDefault: config.isDefault ?? false,
    command: { command, args },
    missingCommandHint: `Install ${config.name} or update its command in lsp.json.`,
    extensions: config.extensions,
    env: config.env,
    initialization: config.initialization,
    skipDirectories: new Set([...COMMON_SKIP_DIRECTORIES, ...(config.skipDirectories ?? [])]),
    diagnosticsSettleMs: config.diagnosticsSettleMs,
    pushDiagnosticsGraceMs: config.pushDiagnosticsGraceMs,
    pullDiagnosticsGraceMs: config.pullDiagnosticsGraceMs,
    isSupportedFile: (filePath) => extensions.has(path.extname(filePath)),
    languageIdFor: (filePath) => LANGUAGE_IDS[path.extname(filePath)] ?? path.extname(filePath).slice(1),
  };
}

/**
 * Normalizes an extension string to include a leading dot.
 */
function withLeadingDot(extension: string) {
  return extension.startsWith(".") ? extension : `.${extension}`;
}

/**
 * Validates and returns a required string array field.
 */
function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

/**
 * Validates and returns an optional string map (env overrides).
 */
function optionalStringMap(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  if (!Object.values(value).every((item) => typeof item === "string")) {
    throw new Error(`${label} must contain only string values.`);
  }
  return value as Record<string, string>;
}

/**
 * Validates and returns an optional object field (initialization options).
 */
function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

/**
 * Validates and returns optional directory names, rejecting separators and
 * reserved names.
 */
function optionalDirectoryNames(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of directory names.`);
  }
  const names = value.map((item) => item.trim());
  if (names.some((name) => !name || name === "." || name === ".." || name.includes("/") || name.includes("\\"))) {
    throw new Error(`${label} must contain non-empty directory names without path separators.`);
  }
  return [...new Set(names)];
}

/**
 * Validates and returns an optional positive number.
 */
function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

/**
 * Returns whether a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
