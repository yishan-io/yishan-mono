import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildServer } from "../../test/support";
import { directoryUri, discoverSupportedFiles, resolveRoot, resolveSingleFile } from "./files";

describe("file helpers", () => {
  test("resolve and validate the workspace root", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-files-root-"));
    try {
      expect(resolveRoot(root)).toBe(root);
      expect(() => resolveRoot(path.join(root, "missing"))).toThrow(/does not exist/);
      const file = path.join(root, "a.txt");
      writeFileSync(file, "x");
      expect(() => resolveRoot(file)).toThrow(/directory/);
      expect(directoryUri(root).startsWith("file://")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("discovers supported files and rejects root escapes", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-files-"));
    try {
      mkdirSync(path.join(root, "src"));
      mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
      writeFileSync(path.join(root, "src", "a.ts"), "const a = 1;\n");
      writeFileSync(path.join(root, "src", "b.txt"), "ignore\n");
      writeFileSync(path.join(root, "node_modules", "pkg", "index.ts"), "export {};\n");
      const server = buildServer("ts", [".ts"]);

      expect(discoverSupportedFiles(server, root, ["src"], 10)).toEqual([path.join(root, "src", "a.ts")]);
      // Skip directories apply during recursion.
      expect(discoverSupportedFiles(server, root, undefined, 10)).toEqual([path.join(root, "src", "a.ts")]);
      // Explicit paths bypass skip directories.
      expect(discoverSupportedFiles(server, root, ["node_modules/pkg"], 10)).toEqual([
        path.join(root, "node_modules", "pkg", "index.ts"),
      ]);
      expect(() => discoverSupportedFiles(server, root, ["../outside"], 10)).toThrow(/escapes workspace root/);
      expect(() => discoverSupportedFiles(server, root, ["missing"], 10)).toThrow(/does not exist/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("honors the file limit", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-files-limit-"));
    try {
      for (let index = 0; index < 5; index += 1) {
        writeFileSync(path.join(root, `a${index}.ts`), "const a = 1;\n");
      }
      const server = buildServer("ts", [".ts"]);
      expect(discoverSupportedFiles(server, root, undefined, 2)).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves single files inside the root", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-files-single-"));
    try {
      writeFileSync(path.join(root, "a.ts"), "const a = 1;\n");
      writeFileSync(path.join(root, "b.txt"), "ignore\n");
      const server = buildServer("ts", [".ts"]);
      expect(resolveSingleFile(server, root, "a.ts")).toBe(path.join(root, "a.ts"));
      expect(() => resolveSingleFile(server, root, "../a.ts")).toThrow(/escapes workspace root/);
      expect(() => resolveSingleFile(server, root, "b.txt")).toThrow(/supported file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
