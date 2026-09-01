import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Context, Fiber } from "@deepseek-ai/cordis";
import { Loader } from "@deepseek-ai/cordis-plugin-loader";

import { type LocalPluginBundle, loadLocalPluginLock } from "./localLock";
import { type VerifiedPluginLock, loadVerifiedPluginLock } from "./lock";
import type { PluginManifestEntry } from "./schema";

const CURRENT_SNAPSHOT_FILE = "plugins.current";
const RESERVED_SERVICE_NAMES = new Set([
  "daemonBridge",
  "loader",
  "mcp",
  "mcpClient",
  "mcpServer",
  "stdio",
  "transport",
  "yishanPluginLoader",
  "yishanProviderCatalog",
  "yishanWorkspaceBinding",
  "yishanWorkspaceBindingHost",
]);

/** The deterministic outcome of one plugin entry. */
export type PluginLoadState = {
  id: string;
  packageName: string;
  state: "loaded" | "rejected";
};
type LoadablePlugin = {
  name: string;
  root: string;
  entries: readonly PluginManifestEntry[];
};
/** A mounted plugin loader and its deterministic entry outcomes. */
export type MountedPluginLoader = {
  states: readonly PluginLoadState[];
  dispose(): Promise<void>;
};

/** Raised when a plugin entry requests a Yishan-owned service or transport. */
export class PluginLoaderPolicyError extends Error {
  constructor(message: string) {
    super(`plugin loader: ${message}`);
    this.name = "PluginLoaderPolicyError";
  }
}

/** Mounts daemon-signed official plugin entries through Cordis Loader. */
export async function mountVerifiedPluginLoader(context: Context, pluginRoot: string): Promise<MountedPluginLoader> {
  if (!(await hasCurrentSnapshot(pluginRoot))) return { states: [], dispose: async () => undefined };
  const lock = await loadVerifiedPluginLock(pluginRoot);
  const loaderFiber = await context.plugin(Loader, { baseUrl: getControlledBaseUrl(lock) });
  try {
    const states = await loadEntries(getLoader(context), lock.packages, "official");
    return { states, dispose: async () => await loaderFiber.dispose() };
  } catch (error) {
    return await disposeAfterStartupFailure(loaderFiber, error);
  }
}

/** Mounts only developer bundles explicitly recorded in the unsigned local manifest. */
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
      ? await context.plugin(Loader, { baseUrl: pathToFileURL(`${pluginRoot}/`).href })
      : undefined;
  try {
    const states = await loadEntries(
      getLoader(context),
      lock.bundles.map((bundle) => ({ name: bundle.id, root: bundle.root, entries: bundle.entries })),
      "local",
    );
    return { states, dispose: async () => await loaderFiber?.dispose() };
  } catch (error) {
    if (loaderFiber === undefined) throw error;
    return await disposeAfterStartupFailure(loaderFiber, error);
  }
}

function getLoader(context: Context): Loader {
  const loader = context.get("loader");
  if (loader === undefined) throw new Error("plugin loader service is unavailable");
  return loader as Loader;
}

async function loadEntries(
  loader: Loader,
  packages: readonly LoadablePlugin[],
  source: "local" | "official",
): Promise<PluginLoadState[]> {
  const states: PluginLoadState[] = [];
  for (const plugin of packages) {
    for (const entry of plugin.entries) {
      const id = createLoaderEntryId(`${source}:${plugin.name}`, entry.id);
      try {
        assertEntryPolicy(entry);
        const loaderEntry = {
          id,
          name: resolve(plugin.root, entry.entrypoint),
          config: entry.config,
          disabled: entry.disabled,
          inject: entry.inject,
        };
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

function assertEntryPolicy(entry: PluginManifestEntry): void {
  const services: readonly string[] = Array.isArray(entry.inject) ? entry.inject : Object.keys(entry.inject);
  if (services.some((service) => RESERVED_SERVICE_NAMES.has(service))) {
    throw new PluginLoaderPolicyError("reserved service requested");
  }
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
  return pathToFileURL(`${lock.snapshotRoot}/`).href;
}

function createLoaderEntryId(packageName: string, entryId: string): string {
  const encodedPackageName = encodeURIComponent(packageName);
  const encodedEntryId = encodeURIComponent(entryId);
  return `${encodedPackageName.length}-${encodedPackageName}-${encodedEntryId}`;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
