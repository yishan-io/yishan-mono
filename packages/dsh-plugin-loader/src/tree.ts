import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export type HashedPluginTree = {
  root: string;
  files: ReadonlySet<string>;
  sha256: string;
};

/** Hashes every regular file in a plugin tree and rejects unsafe filesystem entries. */
export async function hashPluginTree(root: string): Promise<HashedPluginTree> {
  const rootStatus = await lstat(root);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) throw new Error("plugin root is not a directory");
  const canonicalRoot = await realpath(root);
  const files = new Map<string, string>();
  await visit(canonicalRoot, canonicalRoot, files);
  const records = [...files]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([path, sha256]) => ({ path, sha256 }));
  return {
    root: canonicalRoot,
    files: new Set(files.keys()),
    sha256: createHash("sha256").update(JSON.stringify(records)).digest("hex"),
  };
}

async function visit(root: string, directory: string, files: Map<string, string>): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error("plugin tree contains an unsafe entry");
    }
    if (entry.isDirectory()) {
      await visit(root, fullPath, files);
      continue;
    }
    const path = relative(root, fullPath).split(sep).join("/");
    const sha256 = createHash("sha256")
      .update(await readFile(fullPath))
      .digest("hex");
    files.set(path, sha256);
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
