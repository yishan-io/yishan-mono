import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { type LocalPluginManifest, type PluginManifestEntry, localPluginManifestSchema } from "./schema";
import { hashPluginTree } from "./tree";

/** An explicitly registered, developer-only local bundle verified against its tree hash. */
export type LocalPluginBundle = {
  id: string;
  root: string;
  entries: readonly PluginManifestEntry[];
};
/** The separate unsigned manifest for explicitly registered developer bundles. */
export type LocalPluginLock = { bundles: readonly LocalPluginBundle[] };

const LOCAL_LOCK_FILE = "local-bundles.lock.json";

/** Loads and verifies developer-only bundles using the shared plugin entry schema. */
export async function loadLocalPluginLock(dataDirectory: string): Promise<LocalPluginLock> {
  const content = await readFile(join(dataDirectory, LOCAL_LOCK_FILE), "utf8");
  let manifest: LocalPluginManifest;
  try {
    manifest = localPluginManifestSchema.parse(JSON.parse(content));
  } catch {
    throw new Error("local plugin lock: invalid manifest");
  }
  const ids = new Set<string>();
  const bundles: LocalPluginBundle[] = [];
  for (const bundle of manifest.bundles) {
    if (ids.has(bundle.id)) throw new Error("local plugin lock: duplicate bundle");
    ids.add(bundle.id);
    if (!isAbsolute(bundle.root)) throw new Error("local plugin lock: bundle root is not absolute");
    const tree = await hashPluginTree(bundle.root);
    if (tree.sha256 !== bundle.treeSha256) throw new Error("local plugin lock: bundle tree changed");
    assertEntrypoints(bundle.entries, tree.files);
    bundles.push({ id: bundle.id, root: tree.root, entries: bundle.entries });
  }
  return { bundles };
}

function assertEntrypoints(entries: readonly PluginManifestEntry[], files: ReadonlySet<string>): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error("local plugin lock: duplicate entry");
    ids.add(entry.id);
    if (!files.has(entry.entrypoint)) throw new Error("local plugin lock: entrypoint is not in bundle tree");
  }
}
