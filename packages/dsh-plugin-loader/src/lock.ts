import { createPublicKey, verify } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { type PluginManifestEntry, type SignedPluginSnapshot, signedPluginSnapshotSchema } from "./schema";
import { hashPluginTree } from "./tree";

/** A verified daemon-installed package ready for Cordis composition. */
export type VerifiedPluginPackage = {
  name: string;
  version: string;
  root: string;
  entries: readonly PluginManifestEntry[];
};
/** The verified daemon snapshot available for runtime plugin composition. */
export type VerifiedPluginLock = {
  root: string;
  snapshotRoot: string;
  packages: readonly VerifiedPluginPackage[];
};

/** Raised when the daemon-owned plugin snapshot is absent, malformed, or modified. */
export class PluginLockError extends Error {
  constructor(message: string) {
    super(`plugin lock: ${message}`);
    this.name = "PluginLockError";
  }
}

const CURRENT_SNAPSHOT_FILE = "plugins.current";
const SNAPSHOTS_DIRECTORY = ".plugin-snapshots";
const PACKAGES_DIRECTORY = "plugins";
const LOCK_FILE = "plugins.lock.json";
const SIGNATURE_FILE = "plugins.lock.sig";
const SIGNING_KEY_FILE = ".plugins.signing-key";
const SNAPSHOT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Verifies the signed snapshot and every package tree before returning loadable entries. */
export async function loadVerifiedPluginLock(pluginRoot: string): Promise<VerifiedPluginLock> {
  const root = await canonicalDirectory(pluginRoot, "invalid plugin root");
  const snapshotName = (await readRequiredFile(join(root, CURRENT_SNAPSHOT_FILE), "missing current snapshot"))
    .toString("utf8")
    .trim();
  if (!SNAPSHOT_NAME_PATTERN.test(snapshotName) || basename(snapshotName) !== snapshotName) {
    throw new PluginLockError("invalid current snapshot");
  }
  const snapshotRoot = await canonicalDirectory(join(root, SNAPSHOTS_DIRECTORY, snapshotName), "invalid snapshot root");
  assertContained(resolve(root, SNAPSHOTS_DIRECTORY), snapshotRoot, "snapshot escapes plugin root");

  const [content, signature, signingKey] = await Promise.all([
    readRequiredFile(join(snapshotRoot, LOCK_FILE), "missing inventory"),
    readRequiredFile(join(snapshotRoot, SIGNATURE_FILE), "missing inventory signature"),
    readRequiredFile(join(root, SIGNING_KEY_FILE), "missing signing key"),
  ]);
  verifySignature(content, signature, signingKey);

  let snapshot: SignedPluginSnapshot;
  try {
    snapshot = signedPluginSnapshotSchema.parse(JSON.parse(content.toString("utf8")));
  } catch {
    throw new PluginLockError("invalid inventory");
  }
  const names = new Set<string>();
  const packages: VerifiedPluginPackage[] = [];
  for (const plugin of snapshot.plugins) {
    if (names.has(plugin.name)) throw new PluginLockError("duplicate plugin");
    names.add(plugin.name);
    if (!plugin.enabled) continue;
    const tree = await hashPluginTree(join(snapshotRoot, PACKAGES_DIRECTORY, plugin.name));
    if (tree.sha256 !== plugin.treeSha256) throw new PluginLockError("package tree mismatch");
    assertEntrypoints(plugin.entries, tree.files);
    packages.push({ name: plugin.name, version: plugin.version, root: tree.root, entries: plugin.entries });
  }
  packages.sort((left, right) => compareStrings(left.name, right.name));
  return { root, snapshotRoot, packages };
}

function verifySignature(content: Buffer, signature: Buffer, signingKey: Buffer): void {
  if (signingKey.length !== 64) throw new PluginLockError("invalid signing key");
  const encoded = signature.toString("ascii");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new PluginLockError("invalid inventory signature");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== encoded) {
    throw new PluginLockError("invalid inventory signature");
  }
  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, signingKey.subarray(32)]),
    format: "der",
    type: "spki",
  });
  if (!verify(null, content, publicKey, decoded)) throw new PluginLockError("invalid inventory signature");
}

function assertEntrypoints(entries: readonly PluginManifestEntry[], files: ReadonlySet<string>): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new PluginLockError("duplicate plugin entry");
    ids.add(entry.id);
    if (!files.has(entry.entrypoint)) throw new PluginLockError("plugin entrypoint is not in package tree");
  }
}

async function canonicalDirectory(path: string, message: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    throw new PluginLockError(message);
  }
}

async function readRequiredFile(path: string, message: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch {
    throw new PluginLockError(message);
  }
}

function assertContained(parent: string, child: string, message: string): void {
  const path = relative(parent, child);
  if (path === "" || path.startsWith("..")) throw new PluginLockError(message);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
