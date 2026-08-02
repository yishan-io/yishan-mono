import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import type { ResolvedServer } from "../types";
import { LspClient } from "./client";

const fixture = fileURLToPath(new URL("../../test/fixtures/mock-lsp-server.mjs", import.meta.url));

describe("LspClient", () => {
  test("forwards server environment overrides to the process", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-env-"));
    const server = fixtureServer("require-environment");
    server.env = { PI_LSP_TEST_ENV: "forwarded" };
    const client = new LspClient(server, root, 1_000);
    try {
      await client.start();
      await client.initialize(root);
    } finally {
      await client.shutdown();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("pull diagnostics omit optional params when no values are available", async () => {
    const root = await openedRoot("pull-strict-optional-params");
    const client = root.client;
    try {
      const diagnostics = await client.diagnostics(root.uri);
      expect(diagnostics.map(({ message }) => message)).toEqual(["strict pull diagnostic"]);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("advertised pull diagnostic errors propagate", async () => {
    const root = await openedRoot("pull-error");
    const client = root.client;
    try {
      await expect(client.diagnostics(root.uri)).rejects.toThrow(/intentional pull failure/);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("empty pull diagnostics wait for a late push publication", async () => {
    const root = await openedRoot("pull-empty-then-push");
    const client = root.client;
    try {
      const diagnostics = await client.diagnostics(root.uri);
      expect(diagnostics.map(({ message }) => message)).toEqual(["late pull-capable diagnostic"]);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("empty pull diagnostics preserve an already published diagnostic", async () => {
    const root = await openedRoot("pull-empty-after-push");
    const client = root.client;
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const diagnostics = await client.diagnostics(root.uri);
      expect(diagnostics.map(({ message }) => message)).toEqual(["already published diagnostic"]);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("empty pull diagnostics fall back after the configured grace period", async () => {
    const root = await openedRoot("pull-empty-only");
    const client = root.client;
    const startedAt = Date.now();
    try {
      expect(await client.diagnostics(root.uri)).toEqual([]);
      expect(Date.now() - startedAt).toBeLessThan(500);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("push-only servers treat no publication as clean after a grace period", async () => {
    const root = await openedRoot("push-silent");
    const client = root.client;
    const startedAt = Date.now();
    try {
      expect(await client.diagnostics(root.uri)).toEqual([]);
      expect(Date.now() - startedAt).toBeLessThan(500);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("push-only servers preserve a publication within the grace period", async () => {
    const root = await openedRoot("push-silent-then-diagnostic");
    const client = root.client;
    try {
      const diagnostics = await client.diagnostics(root.uri);
      expect(diagnostics.map(({ message }) => message)).toEqual(["late push-only diagnostic"]);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("push diagnostics settle on the latest publication", async () => {
    const root = await openedRoot("push-sequence");
    const client = root.client;
    try {
      const diagnostics = await client.diagnostics(root.uri);
      expect(diagnostics.map(({ message }) => message)).toEqual(["first", "second"]);
    } finally {
      await client.shutdown();
      root.cleanup();
    }
  });

  test("code-action resolution follows the advertised capability", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-resolve-"));
    const action = { title: "fixture action", data: { id: 1 } };
    try {
      for (const [scenario, expectedTitle] of [
        ["resolve-disabled", "fixture action"],
        ["resolve-enabled", "fixture action:resolved"],
      ] as const) {
        const client = new LspClient(fixtureServer(scenario), root, 1_000);
        try {
          await client.start();
          await client.initialize(root);
          const [resolved] = await client.resolveActions([action]);
          expect(resolved?.title).toBe(expectedTitle);
        } finally {
          await client.shutdown();
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("didClose is a no-op after the server is gone", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-didclose-"));
    const file = path.join(root, "main.go");
    writeFileSync(file, "package main\n");
    const client = new LspClient(fixtureServer("push-silent"), root, 1_000);
    try {
      expect(client.didClose(uriFor(file))).toBe(false);
      await client.start();
      await client.initialize(root);
      expect(client.didClose(uriFor(file))).toBe(true);
    } finally {
      await client.shutdown();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * Creates a temp root, spawns and initializes a fixture server for the
 * scenario, opens main.go, and returns handles for assertions and cleanup.
 */
async function openedRoot(scenario: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-opened-"));
  mkdirSync(path.join(root, "pkg"), { recursive: true });
  const file = path.join(root, "pkg", "main.go");
  writeFileSync(file, "package pkg\n");
  const client = new LspClient(fixtureServer(scenario), root, 1_000);
  await client.start();
  await client.initialize(root);
  const uri = uriFor(file);
  client.didOpen(uri, "package pkg\n", "go");
  return {
    client,
    uri,
    cleanup() {
      client.didClose(uri);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function fixtureServer(scenario: string): ResolvedServer {
  return {
    name: `fixture-${scenario}`,
    isDefault: false,
    command: { command: process.execPath, args: [fixture, scenario] },
    missingCommandHint: "Node is required for the test fixture.",
    extensions: [".go"],
    skipDirectories: new Set(),
    diagnosticsSettleMs: 30,
    pushDiagnosticsGraceMs: scenario === "push-silent" || scenario === "push-silent-then-diagnostic" ? 100 : undefined,
    pullDiagnosticsGraceMs:
      scenario === "pull-empty-then-push" || scenario === "pull-empty-after-push" || scenario === "pull-empty-only"
        ? 200
        : undefined,
    isSupportedFile: (filePath) => filePath.endsWith(".go"),
    languageIdFor: () => "go",
  };
}

function uriFor(filePath: string): string {
  return `file://${filePath}`;
}
