import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

import type { PluginPatchConfig, PluginPatchEntry, PluginPatchInject } from "./patch";

/** Raised when an audited data-only adaptation manifest is invalid or misbound. */
export class AdaptationManifestError extends Error {
  constructor(message: string) {
    super(`adaptation manifest: ${message}`);
    this.name = "AdaptationManifestError";
  }
}

/** Parses one hash-bound Yishan adaptation manifest without evaluating upstream YAML. */
export function parseAuditedAdaptationManifest(
  source: string,
  expected: { version: string; sha256: string },
  packageRoot: string,
  inventory: Iterable<string>,
): PluginPatchEntry[] {
  if (createHash("sha256").update(source).digest("hex") !== expected.sha256)
    throw new AdaptationManifestError("hash mismatch");
  const root = getPackageRoot(packageRoot);
  const files = getInventory(inventory);
  const manifest = parseManifest(source, expected.version);
  const identifiers = new Set<string>();
  return manifest.plugins
    .map((entry) => parseEntry(entry, root, files, identifiers))
    .sort((a, b) => compare(a.id, b.id));
}

function parseManifest(source: string, version: string): { plugins: unknown[] } {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new AdaptationManifestError("invalid JSON");
  }
  if (
    !isObject(value) ||
    value.version !== version ||
    !Array.isArray(value.plugins) ||
    !hasOnly(value, ["version", "plugins"])
  )
    throw new AdaptationManifestError("invalid format");
  return { plugins: value.plugins };
}

function parseEntry(value: unknown, root: string, files: ReadonlySet<string>, ids: Set<string>): PluginPatchEntry {
  if (
    !isObject(value) ||
    !hasOnly(value, ["id", "name", "config", "disabled", "inject"]) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.name !== "string"
  )
    throw new AdaptationManifestError("invalid plugin entry");
  if (ids.has(value.id)) throw new AdaptationManifestError("duplicate id");
  ids.add(value.id);
  return {
    id: value.id,
    name: resolveEntrypoint(value.name, root, files),
    config: value.config === undefined ? {} : parseConfig(value.config),
    disabled: value.disabled === undefined ? false : getBoolean(value.disabled),
    inject: value.inject === undefined ? [] : parseInject(value.inject),
  };
}

function getPackageRoot(value: string): string {
  if (!isAbsolute(value)) throw new AdaptationManifestError("invalid package root");
  return resolve(value);
}
function getInventory(values: Iterable<string>): Set<string> {
  const files = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !isSafePath(value) || files.has(value))
      throw new AdaptationManifestError("invalid inventory");
    files.add(value);
  }
  return files;
}
function resolveEntrypoint(value: string, root: string, files: ReadonlySet<string>): string {
  if (!value.startsWith("./") || !isSafePath(value.slice(2)) || !files.has(value.slice(2)))
    throw new AdaptationManifestError("invalid entrypoint");
  const entrypoint = resolve(root, value.slice(2));
  if (relative(root, entrypoint).startsWith("..")) throw new AdaptationManifestError("entrypoint escapes package root");
  return entrypoint;
}
function parseConfig(value: unknown): PluginPatchConfig {
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))
    return value;
  if (typeof value === "string") {
    if (
      value.includes("{{") ||
      value.includes("}}") ||
      value.includes("=>") ||
      /(^|[^\w$])function([^\w$]|$)/.test(value)
    )
      throw new AdaptationManifestError("dynamic config");
    return value;
  }
  if (Array.isArray(value)) return value.map(parseConfig);
  if (!isObject(value)) throw new AdaptationManifestError("invalid config");
  const config: { [key: string]: PluginPatchConfig } = Object.create(null);
  for (const [key, child] of Object.entries(value).sort(([a], [b]) => compare(a, b))) config[key] = parseConfig(child);
  return config;
}
function parseInject(value: unknown): PluginPatchInject {
  if (Array.isArray(value)) {
    if (
      !value.every((service) => typeof service === "string" && service.length > 0) ||
      new Set(value).size !== value.length
    )
      throw new AdaptationManifestError("invalid inject");
    return [...value].sort(compare);
  }
  if (!isObject(value)) throw new AdaptationManifestError("invalid inject");
  const inject: { [service: string]: PluginPatchConfig } = Object.create(null);
  for (const [service, config] of Object.entries(value).sort(([a], [b]) => compare(a, b)))
    inject[service] = parseConfig(config);
  return inject;
}
function getBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AdaptationManifestError("invalid disabled");
  return value;
}
function hasOnly(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return (
    Object.keys(value).every((field) => fields.includes(field)) &&
    fields.every((field) => field in value || field === "config" || field === "disabled" || field === "inject")
  );
}
function isSafePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
