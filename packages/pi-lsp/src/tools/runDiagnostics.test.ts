import { getEventListeners } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { buildServer } from "../../test/support";
import type { ResolvedServer } from "../types";
import { runDiagnostics } from "./runDiagnostics";

const fixture = fileURLToPath(new URL("../../test/fixtures/mock-lsp-server.mjs", import.meta.url));

describe("runDiagnostics", () => {
  test("opens all files before awaiting push publications", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-batch-"));
    try {
      mkdirSync(path.join(root, "pkg"));
      const files = ["a.go", "b.go", "c.go"].map((name) => path.join(root, "pkg", name));
      for (const file of files) writeFileSync(file, "package pkg\n");

      const result = await runDiagnostics(
        batchServer(files.length),
        { root, files },
        1_000,
        undefined,
        { ui: { setStatus() {} } },
        "test",
      );
      const details = result.details as {
        files: Array<{ path: string; diagnostics: Array<{ message: string }> }>;
      };
      expect(details.files.map(({ diagnostics }) => diagnostics.length)).toEqual([1, 1, 1]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns a summary when no supported files match", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-nofiles-"));
    try {
      const result = await runDiagnostics(
        buildServer("ts", [".ts"]),
        { root },
        1_000,
        undefined,
        { ui: { setStatus() {} } },
        "test",
      );
      const text = result.content?.[0]?.text ?? "";
      expect(text).toMatch(/no supported files/);
      const details = result.details as { summary: { files: number; diagnostics: number } };
      expect(details.summary).toEqual({ files: 0, diagnostics: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("cancellation before start neither spawns nor leaks listeners", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-cancel-"));
    try {
      const file = path.join(root, "main.go");
      writeFileSync(file, "package main\n");
      const server = buildServer("custom", [".go"]);

      const preAborted = new AbortController();
      preAborted.abort();
      await expect(
        runDiagnostics(
          server,
          { root, files: [file] },
          100,
          preAborted.signal,
          {
            ui: { setStatus() {} },
          },
          "test",
        ),
      ).rejects.toThrow(/custom LSP request aborted/);
      expect(getEventListeners(preAborted.signal, "abort").length).toBe(0);

      const cancelledByStatus = new AbortController();
      await expect(
        runDiagnostics(
          server,
          { root, files: [file] },
          100,
          cancelledByStatus.signal,
          {
            ui: {
              setStatus() {
                cancelledByStatus.abort();
              },
            },
          },
          "test",
        ),
      ).rejects.toThrow(/custom LSP request aborted/);
      expect(getEventListeners(cancelledByStatus.signal, "abort").length).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function batchServer(expectedFiles: number): ResolvedServer {
  return {
    name: "fixture-batch-push",
    isDefault: false,
    command: { command: process.execPath, args: [fixture, "batch-push", String(expectedFiles)] },
    missingCommandHint: "Node is required for the test fixture.",
    extensions: [".go"],
    skipDirectories: new Set(),
    diagnosticsSettleMs: 30,
    isSupportedFile: (filePath) => filePath.endsWith(".go"),
    languageIdFor: () => "go",
  };
}
