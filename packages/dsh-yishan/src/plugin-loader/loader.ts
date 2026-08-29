import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Context, Fiber } from "@deepseek-ai/cordis";
import { Loader } from "@deepseek-ai/cordis-plugin-loader";

import { parseAuditedAdaptationManifest } from "./adaptation";
import { type LocalPluginBundle, loadLocalPluginLock } from "./localLock";
import { type VerifiedPluginLock, loadVerifiedPluginLock } from "./lock";
import { type PluginPatchEntry, parsePluginPatch } from "./patch";

const CURRENT_SNAPSHOT_FILE = "plugins.current";
const ADAPTATION_MANIFEST_FILE = "yishan.adaptation.json";
const PATCH_FILE = "cordis.patch.yml";
const RESERVED_SERVICE_NAMES = new Set([
  "loader",
  "mcp",
  "mcpClient",
  "mcpServer",
  "stdio",
  "transport",
  "yishan-sdk-jsonrpc-server",
]);

/** The deterministic outcome of one verified official plugin entry. */
export type PluginLoadState = {
  id: string;
  packageName: string;
  state: "loaded" | "rejected";
};
type LoadablePlugin = {
  name: string;
  root: string;
  files: readonly { path: string }[];
};
type AuditedLoadablePlugin = LoadablePlugin & { adaptation: { version: string; sha256: string } };
/** A mounted official plugin loader and its deterministic entry outcomes. */
export type MountedPluginLoader = {
  states: readonly PluginLoadState[];
  dispose(): Promise<void>;
};

/** Raised when a static official patch requests a Yishan-owned service or transport. */
export class PluginLoaderPolicyError extends Error {
  constructor(message: string) {
    super(`plugin loader: ${message}`);
    this.name = "PluginLoaderPolicyError";
  }
}

/**
 * Mounts verified, daemon-installed official patches through Cordis Loader.
 * A missing snapshot is an intentional no-plugin state; a present invalid lock
 * fails startup rather than falling back to unverified package files.
 */
export async function mountVerifiedPluginLoader(context: Context, pluginRoot: string): Promise<MountedPluginLoader> {
  if (!(await hasCurrentSnapshot(pluginRoot))) return { states: [], dispose: async () => undefined };
  const lock = await loadVerifiedPluginLock(pluginRoot);
  const loaderFiber = await context.plugin(Loader, {
    baseUrl: getControlledBaseUrl(lock),
  });
  try {
    const states = await loadEntries(context.loader, lock.packages);
    return { states, dispose: async () => await loaderFiber.dispose() };
  } catch (error) {
    return await disposeAfterStartupFailure(loaderFiber, error);
  }
}

/** Mounts only bundles explicitly recorded in the separate developer lock. */
export async function mountLocalPluginLoader(context: Context, pluginRoot: string): Promise<MountedPluginLoader> {
  let lock: { bundles: readonly LocalPluginBundle[] };
  try {
    lock = await loadLocalPluginLock(pluginRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { states: [], dispose: async () => undefined };
    throw error;
  }
  if (lock.bundles.length === 0) return { states: [], dispose: async () => undefined };
  const loaderFiber =
    context.get("loader") === undefined
      ? await context.plugin(Loader, { baseUrl: getLocalBaseUrl(pluginRoot) })
      : undefined;
  try {
    const states = await loadLocalEntries(
      context.loader,
      lock.bundles.map((bundle) => ({
        name: bundle.id,
        root: bundle.root,
        files: bundle.files,
      })),
    );
    return { states, dispose: async () => await loaderFiber?.dispose() };
  } catch (error) {
    if (loaderFiber === undefined) throw error;
    return await disposeAfterStartupFailure(loaderFiber, error);
  }
}

async function loadEntries(loader: Loader, packages: readonly AuditedLoadablePlugin[]): Promise<PluginLoadState[]> {
  const states: PluginLoadState[] = [];
  for (const plugin of packages) {
    const entries = await parseAuditedPackageEntries(plugin);
    for (const entry of entries) {
      const id = createLoaderEntryId(`official:${plugin.name}`, entry.id);
      try {
        assertEntryPolicy(entry);
        const loaderEntry: PluginPatchEntry = { ...entry, id };
        await loader.root.create(loaderEntry);
        states.push({ id, packageName: plugin.name, state: "loaded" });
      } catch {
        await removeRejectedEntry(loader, id);
        states.push({ id, packageName: plugin.name, state: "rejected" });
      }
    }
  }
  return states.sort((left, right) => compareStrings(left.id, right.id));
}

async function loadLocalEntries(loader: Loader, packages: readonly LoadablePlugin[]): Promise<PluginLoadState[]> {
  const states: PluginLoadState[] = [];
  for (const plugin of packages) {
    for (const entry of await parseLocalPackageEntries(
      plugin.name,
      plugin.root,
      plugin.files.map((file) => file.path),
    )) {
      const id = createLoaderEntryId(`local:${plugin.name}`, entry.id);
      try {
        assertEntryPolicy(entry);
        const loaderEntry: PluginPatchEntry = { ...entry, id };
        await loader.root.create(loaderEntry);
        states.push({ id, packageName: plugin.name, state: "loaded" });
      } catch {
        await removeRejectedEntry(loader, id);
        states.push({ id, packageName: plugin.name, state: "rejected" });
      }
    }
  }
  return states.sort((left, right) => compareStrings(left.id, right.id));
}

async function parseAuditedPackageEntries(plugin: AuditedLoadablePlugin): Promise<PluginPatchEntry[]> {
  const files = new Set(plugin.files.map((file) => file.path));
  if (!files.has(ADAPTATION_MANIFEST_FILE))
    throw new PluginLoaderPolicyError(`missing audited adaptation for ${plugin.name}`);
  let manifest: string;
  try {
    manifest = await readFile(join(plugin.root, ADAPTATION_MANIFEST_FILE), "utf8");
  } catch {
    throw new PluginLoaderPolicyError(`cannot read audited adaptation for ${plugin.name}`);
  }
  return parseAuditedAdaptationManifest(manifest, plugin.adaptation, plugin.root, files);
}

async function parseLocalPackageEntries(
  packageName: string,
  packageRoot: string,
  inventory: Iterable<string>,
): Promise<PluginPatchEntry[]> {
  const files = new Set(inventory);
  if (!files.has(PATCH_FILE)) return [];
  let patch: string;
  try {
    patch = await readFile(join(packageRoot, PATCH_FILE), "utf8");
  } catch {
    throw new PluginLoaderPolicyError(`cannot read local patch for ${packageName}`);
  }
  return parsePluginPatch(patch, { packageRoot, inventory: files });
}

function assertEntryPolicy(entry: PluginPatchEntry): void {
  const services = Array.isArray(entry.inject) ? entry.inject : Object.keys(entry.inject);
  if (services.some((service) => RESERVED_SERVICE_NAMES.has(service)))
    throw new PluginLoaderPolicyError("reserved service requested");
}

async function removeRejectedEntry(loader: Loader, id: string): Promise<void> {
  try {
    loader.resolve(id);
  } catch {
    return;
  }
  await loader.remove(id);
}

async function disposeAfterStartupFailure(loaderFiber: Fiber, startupError: unknown): Promise<never> {
  try {
    await loaderFiber.dispose();
  } catch (cleanupError) {
    throw new AggregateError([startupError, cleanupError], "plugin loader startup cleanup failed");
  }
  throw startupError;
}

async function hasCurrentSnapshot(pluginRoot: string): Promise<boolean> {
  try {
    await access(join(pluginRoot, CURRENT_SNAPSHOT_FILE));
    return true;
  } catch {
    return false;
  }
}

function getControlledBaseUrl(lock: VerifiedPluginLock): string {
  return getLocalBaseUrl(lock.snapshotRoot);
}

function getLocalBaseUrl(root: string): string {
  return pathToFileURL(`${root}/`).href;
}

function createLoaderEntryId(packageName: string, entryId: string): string {
  const encodedPackageName = encodeURIComponent(packageName);
  const encodedEntryId = encodeURIComponent(entryId);
  return `${encodedPackageName.length}-${encodedPackageName}-${encodedEntryId}`;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
