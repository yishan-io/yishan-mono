import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

/** A package file hash recorded in the daemon-signed plugin inventory. */
export type PluginLockFile = { path: string; sha256: string };
/** A daemon-installed package that may contribute a Cordis patch. */
export type VerifiedPluginPackage = {
  name: string;
  version: string;
  root: string;
  files: readonly PluginLockFile[];
  adaptation: { version: string; sha256: string };
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
const LOCK_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SNAPSHOT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ADAPTATION_MANIFEST_FILE = "yishan.adaptation.json";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

type LockPlugin = {
  name: string;
  version: string;
  enabled: boolean;
  treeSha256: string;
  files: PluginLockFile[];
  adaptationVersion: string;
  adaptationSha256: string;
};
type LockInventory = { version: number; plugins: LockPlugin[] };

/**
 * Loads a canonical daemon-signed plugin snapshot and rehashes every recorded
 * regular file before allowing its package roots to be used by the loader.
 */
export async function loadVerifiedPluginLock(pluginRoot: string): Promise<VerifiedPluginLock> {
  const root = await getCanonicalDirectory(pluginRoot, "invalid plugin root");
  const snapshotName = await readSnapshotName(root);
  const snapshotRoot = await getSnapshotRoot(root, snapshotName);
  const [content, signature, signingKey] = await Promise.all([
    readRequiredFile(join(snapshotRoot, LOCK_FILE), "missing inventory"),
    readRequiredFile(join(snapshotRoot, SIGNATURE_FILE), "missing inventory signature"),
    readRequiredFile(join(root, SIGNING_KEY_FILE), "missing signing key"),
  ]);
  verifyInventorySignature(content, signature, signingKey);
  const inventory = parseCanonicalInventory(content);
  const packages = await Promise.all(inventory.plugins.map((plugin) => verifyPluginPackage(snapshotRoot, plugin)));
  return {
    root,
    snapshotRoot,
    packages: packages.filter((_, index) => inventory.plugins[index]?.enabled),
  };
}

function verifyInventorySignature(content: Buffer, signature: Buffer, signingKey: Buffer): void {
  if (signingKey.length !== 64) throw new PluginLockError("invalid signing key");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature.toString("ascii")))
    throw new PluginLockError("invalid inventory signature");
  const encodedSignature = signature.toString("ascii");
  const decodedSignature = Buffer.from(encodedSignature, "base64");
  if (decodedSignature.length !== 64 || decodedSignature.toString("base64") !== encodedSignature)
    throw new PluginLockError("invalid inventory signature");
  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, signingKey.subarray(32)]),
    format: "der",
    type: "spki",
  });
  if (!verify(null, content, publicKey, decodedSignature)) throw new PluginLockError("invalid inventory signature");
}

function parseCanonicalInventory(content: Buffer): LockInventory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString("utf8"));
  } catch {
    throw new PluginLockError("invalid inventory");
  }
  const inventory = parseInventory(parsed);
  const canonical = JSON.stringify({
    version: inventory.version,
    plugins: [...inventory.plugins]
      .sort((left, right) => compareStrings(left.name, right.name))
      .map((plugin) => ({
        ...plugin,
        files: [...plugin.files].sort((left, right) => compareStrings(left.path, right.path)),
      })),
  });
  if (!content.equals(Buffer.from(canonical))) throw new PluginLockError("non-canonical inventory");
  return inventory;
}

function parseInventory(value: unknown): LockInventory {
  const object = getExactObject(value, ["version", "plugins"]);
  if (object.version !== LOCK_VERSION || !Array.isArray(object.plugins))
    throw new PluginLockError("unsupported inventory");
  const names = new Set<string>();
  const plugins = object.plugins.map((plugin) => parsePlugin(plugin, names));
  if (!isStrictlySorted(plugins.map((plugin) => plugin.name))) throw new PluginLockError("non-canonical inventory");
  return { version: object.version, plugins };
}

function parsePlugin(value: unknown, names: Set<string>): LockPlugin {
  const object = getExactObject(value, [
    "name",
    "version",
    "enabled",
    "treeSha256",
    "files",
    "adaptationVersion",
    "adaptationSha256",
  ]);
  if (
    typeof object.name !== "string" ||
    object.name.length === 0 ||
    typeof object.version !== "string" ||
    object.version.length === 0 ||
    typeof object.enabled !== "boolean" ||
    typeof object.treeSha256 !== "string" ||
    !SHA256_PATTERN.test(object.treeSha256) ||
    typeof object.adaptationVersion !== "string" ||
    object.adaptationVersion.length === 0 ||
    typeof object.adaptationSha256 !== "string" ||
    !SHA256_PATTERN.test(object.adaptationSha256) ||
    !Array.isArray(object.files) ||
    names.has(object.name)
  ) {
    throw new PluginLockError("unsupported publisher or inventory entry");
  }
  names.add(object.name);
  const paths = new Set<string>();
  const files = object.files.map((file) => {
    const fileObject = getExactObject(file, ["path", "sha256"]);
    if (
      typeof fileObject.path !== "string" ||
      !isSafeRelativePath(fileObject.path) ||
      typeof fileObject.sha256 !== "string" ||
      !SHA256_PATTERN.test(fileObject.sha256) ||
      paths.has(fileObject.path)
    ) {
      throw new PluginLockError("invalid inventory file");
    }
    paths.add(fileObject.path);
    return { path: fileObject.path, sha256: fileObject.sha256 };
  });
  if (!isStrictlySorted(files.map((file) => file.path))) throw new PluginLockError("non-canonical inventory");
  const adaptationFile = files.find((file) => file.path === ADAPTATION_MANIFEST_FILE);
  if (adaptationFile?.sha256 !== object.adaptationSha256)
    throw new PluginLockError("audited adaptation manifest binding mismatch");
  return {
    name: object.name,
    version: object.version,
    enabled: object.enabled,
    treeSha256: object.treeSha256,
    files,
    adaptationVersion: object.adaptationVersion,
    adaptationSha256: object.adaptationSha256,
  };
}

async function verifyPluginPackage(snapshotRoot: string, plugin: LockPlugin): Promise<VerifiedPluginPackage> {
  const root = await getPackageRoot(snapshotRoot, plugin.name);
  const { files: actualFiles, directories: actualDirectories } = await hashPackageFiles(root);
  const expectedFiles = new Map(plugin.files.map((file) => [file.path, file.sha256]));
  if (actualFiles.size !== expectedFiles.size || !hasExpectedDirectories(actualDirectories, plugin.files))
    throw new PluginLockError("package tree mismatch");
  for (const [path, hash] of actualFiles)
    if (expectedFiles.get(path) !== hash) throw new PluginLockError("package tree mismatch");
  const treeHash = await hashTree(plugin.files);
  if (treeHash !== plugin.treeSha256) throw new PluginLockError("package tree mismatch");
  return {
    name: plugin.name,
    version: plugin.version,
    root,
    files: plugin.files,
    adaptation: {
      version: plugin.adaptationVersion,
      sha256: plugin.adaptationSha256,
    },
  };
}

async function hashPackageFiles(root: string): Promise<{ files: Map<string, string>; directories: Set<string> }> {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  await visitTree(root, root, files, directories);
  return { files, directories };
}

async function visitTree(
  root: string,
  directory: string,
  files: Map<string, string>,
  directories: Set<string>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new PluginLockError("package tree contains unsafe entry");
    if (entry.isDirectory()) {
      directories.add(relative(root, fullPath).split(sep).join("/"));
      await visitTree(root, fullPath, files, directories);
    } else {
      const path = relative(root, fullPath).split(sep).join("/");
      files.set(path, await sha256(await readFile(fullPath)));
    }
  }
}

function hasExpectedDirectories(actual: ReadonlySet<string>, files: readonly PluginLockFile[]): boolean {
  const expected = new Set<string>();
  for (const file of files) {
    const segments = file.path.split("/");
    segments.pop();
    while (segments.length > 0) {
      expected.add(segments.join("/"));
      segments.pop();
    }
  }
  return expected.size === actual.size && [...expected].every((directory) => actual.has(directory));
}

async function hashTree(files: readonly PluginLockFile[]): Promise<string> {
  const canonicalFiles = [...files].sort((left, right) => compareStrings(left.path, right.path));
  return createHash("sha256").update(JSON.stringify(canonicalFiles)).digest("hex");
}

async function getPackageRoot(snapshotRoot: string, packageName: string): Promise<string> {
  const root = resolve(snapshotRoot, PACKAGES_DIRECTORY, packageName);
  if (!isWithin(snapshotRoot, root)) throw new PluginLockError("invalid package root");
  return await getCanonicalDirectory(root, "missing package tree");
}

async function getSnapshotRoot(root: string, snapshotName: string): Promise<string> {
  const snapshotRoot = resolve(root, SNAPSHOTS_DIRECTORY, snapshotName);
  if (!isWithin(join(root, SNAPSHOTS_DIRECTORY), snapshotRoot)) throw new PluginLockError("invalid snapshot");
  return await getCanonicalDirectory(snapshotRoot, "missing snapshot");
}

async function readSnapshotName(root: string): Promise<string> {
  const name = (await readRequiredFile(join(root, CURRENT_SNAPSHOT_FILE), "missing current snapshot")).toString("utf8");
  if (name.trim() !== name || !SNAPSHOT_NAME_PATTERN.test(name) || basename(name) !== name)
    throw new PluginLockError("invalid current snapshot");
  return name;
}

async function getCanonicalDirectory(path: string, message: string): Promise<string> {
  try {
    const canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory()) throw new PluginLockError(message);
    return canonical;
  } catch (error) {
    if (error instanceof PluginLockError) throw error;
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

async function sha256(content: Buffer): Promise<string> {
  return createHash("sha256").update(content).digest("hex");
}

function getExactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new PluginLockError("invalid inventory");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== fields.length || fields.some((field) => !Object.hasOwn(object, field)))
    throw new PluginLockError("invalid inventory");
  return object;
}

function isSafeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  );
}

function isWithin(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

function isStrictlySorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compareStrings(values[index - 1] ?? "", value) < 0);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
