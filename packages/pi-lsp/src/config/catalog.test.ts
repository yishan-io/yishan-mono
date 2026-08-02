import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { discoverSupportedFiles } from "../helpers/files";
import { COMMON_SKIP_DIRECTORIES, DEFAULT_SERVERS, LANGUAGE_IDS } from "./catalog";
import { bindServer } from "./config";

describe("built-in server catalog", () => {
  test("ships the expected servers with unique names", () => {
    expect(DEFAULT_SERVERS.length).toBe(28);
    const names = DEFAULT_SERVERS.map((server) => server.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).toBe("biome");
    expect(names.some((name) => name === "gopls")).toBe(true);
  });

  test("keeps per-server diagnostics policies", () => {
    const byName = new Map(DEFAULT_SERVERS.map((server) => [server.name, server]));
    expect(byName.get("rust-analyzer")?.pullDiagnosticsGraceMs).toBe(5_000);
    expect(byName.get("intelephense")?.diagnosticsSettleMs).toBe(4000);
    expect(byName.get("lua-language-server")?.pushDiagnosticsGraceMs).toBe(3_000);
    expect(byName.get("haskell-language-server")?.pushDiagnosticsGraceMs).toBe(3_000);
    for (const name of ["dart", "terraform-ls", "gleam", "tinymist"]) {
      expect(byName.get(name)?.pushDiagnosticsGraceMs).toBe(2_000);
    }
  });

  test("maps language ids from file extensions", () => {
    const biome = bindServer({ name: "biome", command: ["biome", "lsp-proxy"], extensions: [".ts"] });
    expect(biome.languageIdFor("src/app.ts")).toBe("typescript");
    const gopls = bindServer({ name: "gopls", command: ["gopls"], extensions: [".go"] });
    expect(gopls.languageIdFor("main.go")).toBe("go");
    expect(LANGUAGE_IDS[".rs"]).toBe("rust");
    expect(LANGUAGE_IDS[".yml"]).toBe("yaml");
  });

  test("skips generated trees during discovery", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-catalog-files-"));
    try {
      mkdirSync(path.join(root, "src"));
      mkdirSync(path.join(root, "target"));
      mkdirSync(path.join(root, "vendor"));
      writeFileSync(path.join(root, "src", "main.go"), "package main\n");
      writeFileSync(path.join(root, "target", "generated.go"), "package generated\n");
      writeFileSync(path.join(root, "vendor", "dependency.go"), "package dependency\n");
      const gopls = bindServer({ name: "gopls", command: ["gopls"], extensions: [".go"] });

      expect(discoverSupportedFiles(gopls, root, undefined, 50)).toEqual([path.join(root, "src", "main.go")]);
      // Explicit paths bypass skip directories.
      expect(discoverSupportedFiles(gopls, root, ["target"], 50)).toEqual([path.join(root, "target", "generated.go")]);
      expect(COMMON_SKIP_DIRECTORIES.has("target")).toBe(true);
      expect(COMMON_SKIP_DIRECTORIES.has("vendor")).toBe(true);
      expect(COMMON_SKIP_DIRECTORIES.has("node_modules")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("elixir-ls uses the platform-appropriate launcher", () => {
    const elixir = DEFAULT_SERVERS.find((server) => server.name === "elixir-ls");
    expect(elixir?.command[0]).toBe(process.platform === "win32" ? "language_server.bat" : "language_server.sh");
  });
});
