import { getEventListeners } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildServer } from "../../test/support";
import { runFix } from "./runFix";

describe("runFix", () => {
  test("cancellation before start neither spawns nor leaks listeners", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-fix-cancel-"));
    try {
      writeFileSync(path.join(root, "main.go"), "package main\n");
      const server = buildServer("custom", [".go"]);

      const preAborted = new AbortController();
      preAborted.abort();
      await expect(
        runFix(
          server,
          { root, path: "main.go" },
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
        runFix(
          server,
          { root, path: "main.go" },
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

  test("rejects unsupported files before spawning", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-fix-unsupported-"));
    try {
      writeFileSync(path.join(root, "notes.txt"), "hello\n");
      const server = buildServer("ts", [".ts"]);
      await expect(
        runFix(
          server,
          { root, path: "notes.txt" },
          100,
          undefined,
          {
            ui: { setStatus() {} },
          },
          "test",
        ),
      ).rejects.toThrow(/supported file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
