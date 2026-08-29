import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

/** An explicitly registered, developer-only local bundle verified against its local lock. */
export type LocalPluginBundle = { id: string; root: string; files: readonly { path: string; sha256: string }[] };
/** The separate unsigned lock format for explicitly registered developer bundles. */
export type LocalPluginLock = { bundles: readonly LocalPluginBundle[] };

const LOCAL_LOCK_FILE = "local-bundles.lock.json";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Loads and verifies the developer-only local bundle lock and every recorded file. */
export async function loadLocalPluginLock(dataDirectory: string): Promise<LocalPluginLock> {
  const content = await readFile(join(dataDirectory, LOCAL_LOCK_FILE), "utf8");
  const value = parseLock(content);
  const bundles = await Promise.all(value.bundles.map(verifyBundle));
  if (new Set(bundles.map((bundle) => bundle.id)).size !== bundles.length)
    throw new Error("local plugin lock: duplicate bundle");
  return { bundles };
}

function parseLock(content: string): { version: number; bundles: unknown[] } {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("local plugin lock: invalid JSON");
  }
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.bundles) || Object.keys(value).length !== 2)
    throw new Error("local plugin lock: invalid format");
  return { version: value.version, bundles: value.bundles };
}

async function verifyBundle(value: unknown): Promise<LocalPluginBundle> {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    !ID_PATTERN.test(value.id) ||
    typeof value.root !== "string" ||
    !Array.isArray(value.files) ||
    Object.keys(value).length !== 3
  )
    throw new Error("local plugin lock: invalid bundle");
  if (!isAbsolute(value.root)) throw new Error("local plugin lock: bundle root is not absolute");
  const root = await realpath(value.root);
  const files = value.files.map(parseFile);
  if (!files.some((file) => file.path === "cordis.patch.yml")) throw new Error("local plugin lock: missing patch");
  const actual = await hashTree(root);
  if (actual.size !== files.length || files.some((file) => actual.get(file.path) !== file.sha256))
    throw new Error("local plugin lock: bundle tree changed");
  return { id: value.id, root, files };
}

function parseFile(value: unknown): { path: string; sha256: string } {
  if (
    !isObject(value) ||
    typeof value.path !== "string" ||
    !isSafePath(value.path) ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    Object.keys(value).length !== 2
  )
    throw new Error("local plugin lock: invalid file");
  return { path: value.path, sha256: value.sha256 };
}

async function hashTree(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  await visit(root, root, files);
  return files;
}

async function visit(root: string, directory: string, files: Map<string, string>): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
      throw new Error("local plugin lock: unsafe tree entry");
    if (entry.isDirectory()) await visit(root, fullPath, files);
    else {
      const path = relative(root, fullPath).split(sep).join("/");
      files.set(
        path,
        createHash("sha256")
          .update(await readFile(fullPath))
          .digest("hex"),
      );
    }
  }
}

function isSafePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
