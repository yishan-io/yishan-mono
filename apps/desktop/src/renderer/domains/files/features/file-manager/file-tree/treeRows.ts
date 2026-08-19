import type { TreeNode } from "./types";
import type { VisibleRow } from "./types";

/** Sorts file-tree nodes so folders appear before files and names stay stable. */
export function sortNodes(a: TreeNode, b: TreeNode): number {
  const aIsFolder = a.isDirectory || a.children.size > 0;
  const bIsFolder = b.isDirectory || b.children.size > 0;

  if (aIsFolder !== bIsFolder) {
    return aIsFolder ? -1 : 1;
  }

  return a.name.localeCompare(b.name);
}

/** Computes visible rows from a flat file path list + expanded directories, without building a tree. */
export function computeVisibleRows(files: string[], expandedPathSet: Set<string>): VisibleRow[] {
  type Node = { name: string; path: string; isDirectory: boolean; children: Node[] };
  const root: Node = { name: "", path: "", isDirectory: true, children: [] };

  for (const entryPath of files) {
    const isDir = entryPath.endsWith("/");
    const normalizedPath = entryPath.replace(/\/$/, "");
    const parts = normalizedPath.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) {
        continue;
      }
      const childPath = parts.slice(0, i + 1).join("/");
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: childPath, isDirectory: isDir && i === parts.length - 1, children: [] };
        current.children.push(child);
      } else if (isDir && i === parts.length - 1) {
        child.isDirectory = true;
      }
      current = child;
    }
  }

  const rows: VisibleRow[] = [];

  function walk(nodes: Node[], depth: number) {
    nodes.sort((a, b) => {
      const aDir = a.isDirectory || a.children.length > 0;
      const bDir = b.isDirectory || b.children.length > 0;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      const isDir = node.isDirectory || node.children.length > 0;
      rows.push({
        path: node.path,
        name: node.name,
        depth,
        isDirectory: isDir,
        hasChildren: node.children.length > 0,
      });
      if (isDir && expandedPathSet.has(node.path)) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(root.children, 0);
  return rows;
}

/** Builds one nested tree structure from workspace-relative file and directory paths. */
export function buildTree(files: string[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: new Map(),
  };

  for (const entryPath of files) {
    const isDirectory = entryPath.endsWith("/");
    const normalizedPath = entryPath.replace(/\/$/, "");
    const parts = normalizedPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let current = root;
    let currentPath = "";

    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existingNode = current.children.get(part);
      const isLeaf = index === parts.length - 1;

      if (existingNode) {
        if (isLeaf && isDirectory) {
          existingNode.isDirectory = true;
        }
        current = existingNode;
        continue;
      }

      const nextNode: TreeNode = {
        name: part,
        path: currentPath,
        isDirectory: isLeaf ? isDirectory : true,
        children: new Map(),
      };

      current.children.set(part, nextNode);
      current = nextNode;
    }
  }

  return root;
}

/** Collects default-expanded implicit directory paths while leaving explicit or ignored directories collapsed. */
export function collectExpandedItems(
  nodes: TreeNode[],
  ignoredPathSet: Set<string>,
  explicitDirectoryPathSet: Set<string>,
): string[] {
  const expandedItems: string[] = [];

  for (const node of nodes) {
    if (node.children.size > 0) {
      if (ignoredPathSet.has(node.path) || explicitDirectoryPathSet.has(node.path)) {
        continue;
      }

      expandedItems.push(node.path);
      expandedItems.push(
        ...collectExpandedItems([...node.children.values()], ignoredPathSet, explicitDirectoryPathSet),
      );
    }
  }

  return expandedItems;
}

/** Collects visible directory paths for keyboard paste destination resolution. */
export function collectDirectoryPaths(nodes: TreeNode[]): Set<string> {
  const directoryPaths = new Set<string>();

  for (const node of nodes) {
    if (node.isDirectory || node.children.size > 0) {
      directoryPaths.add(node.path);
      for (const childPath of collectDirectoryPaths([...node.children.values()])) {
        directoryPaths.add(childPath);
      }
    }
  }

  return directoryPaths;
}

/** Collects ancestor directory paths needed to reveal one workspace-relative path in the tree. */
export function collectAncestorDirectoryPaths(path: string): string[] {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  const ancestorPaths: string[] = [];

  for (let index = 0; index < parts.length - 1; index += 1) {
    ancestorPaths.push(parts.slice(0, index + 1).join("/"));
  }

  return ancestorPaths;
}

/** Returns the last path segment used as one displayed or editable entry name. */
export function getEntryName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "";
}

/** Resolves one parent directory path from a workspace-relative file-tree path. */
export function getParentDirectoryPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

/** Resolves the destination directory for one selected file-tree path. */
export function resolveDestinationDirectoryPath(targetPath: string, targetIsDirectory: boolean): string {
  if (!targetPath) {
    return "";
  }

  return targetIsDirectory ? targetPath : getParentDirectoryPath(targetPath);
}

/** Joins one base path with one child name using normalized forward slashes. */
export function joinChildPath(basePath: string, name: string): string {
  return basePath ? `${basePath}/${name}` : name;
}

/** Resolves one unique child name under a base path with numeric suffix fallback. */
export function resolveUniqueChildName(existingEntries: string[], basePath: string, seedName: string): string {
  const existing = new Set(
    existingEntries.map((entry) => {
      const normalized = entry.replace(/\/$/, "");
      return normalized;
    }),
  );

  let attempt = seedName;
  let index = 1;

  while (existing.has(joinChildPath(basePath, attempt))) {
    attempt = `${seedName}-${index}`;
    index += 1;
  }

  return attempt;
}
