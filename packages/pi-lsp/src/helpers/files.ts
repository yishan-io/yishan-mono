/**
 * Workspace-rooted file helpers: root validation, URI conversion, and
 * bounded recursive discovery for a server binding.
 */
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import type { ResolvedServer } from "../types";

/**
 * Resolves and validates a workspace root directory, defaulting to cwd.
 */
export function resolveRoot(root?: string): string {
  const resolved = path.resolve(root?.trim() || process.cwd());
  if (!existsSync(resolved)) throw new Error(`Workspace root does not exist: ${resolved}`);
  if (!statSync(resolved).isDirectory()) {
    throw new Error(`Expected workspace root to be a directory: ${resolved}`);
  }
  return resolved;
}

/**
 * Converts a directory path into a file:// URI with a trailing separator.
 */
export function directoryUri(directory: string): string {
  return pathToFileURL(directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`).href;
}

/**
 * Resolves a single file path inside the workspace root and validates that
 * it exists, stays inside the root, and is supported by the server.
 */
export function resolveSingleFile(server: ResolvedServer, root: string, filePath: string): string {
  const resolved = resolveInsideRoot(root, filePath, "File path");
  if (!existsSync(resolved)) throw new Error(`${server.name} file does not exist: ${resolved}`);
  if (!statSync(resolved).isFile()) throw new Error(`Expected a file: ${resolved}`);
  if (!server.isSupportedFile(resolved)) {
    throw new Error(`Expected a ${server.name} supported file: ${resolved}`);
  }
  return resolved;
}

/**
 * Discovers supported files under the root (or requested paths), bounded by
 * limit and skipping server-listed directories. Symlink cycles are avoided
 * via realpath tracking.
 */
export function discoverSupportedFiles(
  server: ResolvedServer,
  root: string,
  requestedPaths: string[] | undefined,
  limit: number,
): string[] {
  const cappedLimit = Math.max(1, Math.floor(limit));
  const files: string[] = [];
  const seen = new Set<string>();
  const visitedDirs = new Set<string>();
  const realRoot = realpathSync(root);
  const inputs = requestedPaths?.length ? requestedPaths : [root];

  for (const input of inputs) {
    const target = resolveInsideRoot(root, input, "Requested path");
    if (!existsSync(target)) throw new Error(`Requested path does not exist: ${target}`);
    if (!isInside(realRoot, realpathSync(target))) {
      throw new Error(`Requested path resolves outside workspace root: ${target}`);
    }
    walk(server, target, files, seen, visitedDirs, realRoot, cappedLimit);
    if (files.length >= cappedLimit) break;
  }

  return files;
}

/**
 * Recursively walks one path, collecting supported files up to the limit.
 */
function walk(
  server: ResolvedServer,
  target: string,
  files: string[],
  seen: Set<string>,
  visitedDirs: Set<string>,
  realRoot: string,
  limit: number,
): void {
  if (files.length >= limit || !existsSync(target)) return;
  if (!isInside(realRoot, realpathSync(target))) return;

  const stats = statSync(target);
  if (stats.isFile()) {
    if (server.isSupportedFile(target) && !seen.has(target)) {
      seen.add(target);
      files.push(target);
    }
    return;
  }

  if (!stats.isDirectory()) return;
  const dirKey = realpathSync(target);
  if (visitedDirs.has(dirKey)) return;
  visitedDirs.add(dirKey);

  const entries = readdirSync(target, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    if (files.length >= limit) break;
    if ((entry.isDirectory() || entry.isSymbolicLink()) && server.skipDirectories.has(entry.name)) {
      continue;
    }
    walk(server, path.join(target, entry.name), files, seen, visitedDirs, realRoot, limit);
  }
}

/**
 * Resolves an input path against the workspace root, rejecting escapes and
 * normalizing symlink-resolved paths back inside the root when possible.
 */
function resolveInsideRoot(root: string, inputPath: string, label: string): string {
  const resolved = path.resolve(root, inputPath);
  const realRoot = realpathSync(root);
  const lexicallyInside = isInside(root, resolved);

  if (existsSync(resolved)) {
    const realResolved = realpathSync(resolved);
    if (!isInside(realRoot, realResolved)) {
      throw new Error(`${label} resolves outside workspace root: ${resolved}`);
    }
    return lexicallyInside ? resolved : path.join(root, path.relative(realRoot, realResolved));
  }

  if (!lexicallyInside && !isInside(realRoot, resolved)) {
    throw new Error(`${label} escapes workspace root: ${resolved}`);
  }
  return resolved;
}

/**
 * Returns whether child is lexically inside parent (or equal to it).
 */
function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
