import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildServer } from "../../test/support";
import { selectDiagnosticRoutes, selectFixServer } from "./selectServers";

describe("server selection", () => {
  test("filters by server name and rejects unknown names", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-select-"));
    try {
      writeFileSync(path.join(root, "a.ts"), "const a = 1;\n");
      const ts = buildServer("ts", [".ts"]);
      const alsoTs = buildServer("also-ts", [".ts"]);

      const selected = selectDiagnosticRoutes([ts, alsoTs], { root, server: ["ts"] }, 50);
      expect(selected.routes.map((route) => route.server.name)).toEqual(["ts"]);

      try {
        selectDiagnosticRoutes([ts, alsoTs], { root, server: "missing" }, 50);
        expect.unreachable("expected unknown server error");
      } catch (error) {
        expect((error as Error).message).toBe(
          "Unknown LSP server(s): missing. Configured LSP servers: ts, also-ts. " +
            "Omit the server parameter to select matching servers automatically.",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects ambiguous fix routes without a server name", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-select-fix-"));
    try {
      writeFileSync(path.join(root, "a.ts"), "const a = 1;\n");
      const ts = buildServer("ts", [".ts"]);
      const alsoTs = buildServer("also-ts", [".ts"]);

      expect(() => selectFixServer([ts, alsoTs], { root, path: "a.ts" })).toThrow(/Multiple LSP servers/);
      expect(selectFixServer([ts, alsoTs], { root, path: "a.ts", server: "also-ts" }).server.name).toBe("also-ts");
      expect(() => selectFixServer([ts, alsoTs], { root, path: "b.rs" })).toThrow(/No fix route/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps per-server skip policies isolated in the file cache", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-select-cache-"));
    try {
      mkdirSync(path.join(root, "generated"));
      mkdirSync(path.join(root, "src"));
      writeFileSync(path.join(root, "generated", "output.foo"), "generated\n");
      writeFileSync(path.join(root, "src", "main.foo"), "source\n");
      const skipGenerated = buildServer("skip-generated", [".foo"]);
      skipGenerated.skipDirectories.add("generated");
      const includeGenerated = buildServer("include-generated", [".foo"]);

      const selected = selectDiagnosticRoutes([skipGenerated, includeGenerated], { root }, 50);
      const routes = new Map(selected.routes.map((route) => [route.server.name, route.files]));
      expect(routes.get("skip-generated")).toEqual([path.join(root, "src", "main.foo")]);
      expect(routes.get("include-generated")).toEqual([
        path.join(root, "generated", "output.foo"),
        path.join(root, "src", "main.foo"),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("skips missing default commands but preserves explicit selection", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-select-availability-"));
    try {
      writeFileSync(path.join(root, "main.foo"), "source\n");
      const executable = path.join(root, "available-lsp");
      writeFileSync(executable, "#!/bin/sh\nexit 0\n");
      chmodSync(executable, 0o755);
      const available = buildServer("available", [".foo"]);
      available.command = { command: "available-lsp", args: [] };
      available.env = { PATH: root };
      available.isDefault = true;
      const missing = buildServer("missing", [".foo"]);
      missing.command = { command: "./missing-lsp", args: [] };
      missing.isDefault = true;
      let missingFileChecks = 0;
      missing.isSupportedFile = (filePath) => {
        missingFileChecks += 1;
        return filePath.endsWith(".foo");
      };

      const selected = selectDiagnosticRoutes([available, missing], { root }, 50);
      expect(selected.routes.map((route) => route.server.name)).toEqual(["available"]);
      expect(selected.skipped.map((route) => route.server.name)).toEqual(["missing"]);
      expect(missingFileChecks).toBe(0);

      const explicit = selectDiagnosticRoutes([missing], { root, server: "missing" }, 50);
      expect(explicit.routes.map((route) => route.server.name)).toEqual(["missing"]);
      expect(missingFileChecks > 0).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("throws when no route matches any files", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-select-none-"));
    try {
      const unrelated = buildServer("unrelated", [".bar"]);
      expect(() => selectDiagnosticRoutes([unrelated], { root }, 50)).toThrow(/No supported files/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
