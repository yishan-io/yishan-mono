import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerMemoryTools } from "./registerMemoryTools";

describe("registerMemoryTools", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("registers memory_search, memory_read, memory_store, and memory_reconcile tools", () => {
    const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
    const pi = {
      registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
        tools.push(tool);
      },
    };

    registerMemoryTools(
      pi as never,
      {
        search: vi.fn(),
        reconcile: vi.fn(),
      } as never,
    );

    expect(tools.map((tool) => tool.name)).toEqual([
      "memory_search",
      "memory_read",
      "memory_store",
      "memory_reconcile",
    ]);
  });

  it("routes memory_search through the cli client", async () => {
    const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
    const search = vi.fn(async () => [{ path: "/tmp/MEMORY.md", snippet: "hit", score: 0.1 }]);
    const pi = {
      registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
        tools.push(tool);
      },
    };

    registerMemoryTools(pi as never, { search, reconcile: vi.fn() } as never);

    const tool = tools.find((entry) => entry.name === "memory_search");
    if (!tool) {
      throw new Error("Expected memory_search tool");
    }

    const result = await tool.execute("tool-1", { query: "auth", projectId: "proj-1" }, undefined, undefined, {});
    expect(search).toHaveBeenCalledWith({ query: "auth", projectId: "proj-1", scope: undefined, limit: undefined });
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify([{ path: "/tmp/MEMORY.md", snippet: "hit", score: 0.1 }], null, 2) },
      ],
      details: { count: 1 },
    });
  });

  it("reads a memory file under .my-context", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pi-memory-read-"));
    try {
      const docsDir = join(tempRoot, ".my-context", "architecture");
      mkdirSync(docsDir, { recursive: true });
      const memoryDocPath = join(docsDir, "flow.md");
      writeFileSync(memoryDocPath, "# Flow\n\nUse the indexed backend.\n", "utf8");

      const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
      const pi = {
        registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
          tools.push(tool);
        },
      };

      registerMemoryTools(pi as never, { search: vi.fn(), reconcile: vi.fn() } as never);
      const tool = tools.find((entry) => entry.name === "memory_read");
      if (!tool) {
        throw new Error("Expected memory_read tool");
      }

      const result = (await tool.execute(
        "tool-1",
        {
          projectRoot: tempRoot,
          path: "architecture/flow.md",
        },
        undefined,
        undefined,
        {},
      )) as { content: Array<{ text?: string }>; details?: { path?: string } };

      expect(String(result.content[0]?.text ?? "")).toContain("Use the indexed backend.");
      expect(result.details?.path).toBe(memoryDocPath);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects memory_read path escapes outside .my-context", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pi-memory-read-escape-"));
    try {
      mkdirSync(join(tempRoot, ".my-context"), { recursive: true });

      const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
      const pi = {
        registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
          tools.push(tool);
        },
      };

      registerMemoryTools(pi as never, { search: vi.fn(), reconcile: vi.fn() } as never);
      const tool = tools.find((entry) => entry.name === "memory_read");
      if (!tool) {
        throw new Error("Expected memory_read tool");
      }

      await expect(
        tool.execute(
          "tool-1",
          {
            projectRoot: tempRoot,
            path: "../outside.md",
          },
          undefined,
          undefined,
          {},
        ),
      ).rejects.toThrow("Memory path must stay within .my-context/");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("stores a locked decision in .my-context/MEMORY.md", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pi-memory-store-"));
    try {
      mkdirSync(join(tempRoot, ".my-context"), { recursive: true });
      const memoryPath = join(tempRoot, ".my-context", "MEMORY.md");
      writeFileSync(
        memoryPath,
        "# Project Memory\n\n_Last updated: 2026-07-01_\n\n## Locked Decisions\n\n## Durable Discoveries\n\n## Open Questions\n",
        { encoding: "utf8", flag: "w" },
      );

      const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
      const pi = {
        registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
          tools.push(tool);
        },
      };

      registerMemoryTools(pi as never, { search: vi.fn(), reconcile: vi.fn() } as never);
      const tool = tools.find((entry) => entry.name === "memory_store");
      if (!tool) {
        throw new Error("Expected memory_store tool");
      }

      const result = (await tool.execute(
        "tool-1",
        {
          projectRoot: tempRoot,
          section: "locked_decisions",
          entry: "Use hybrid backend. Why: reuse CLI indexing.",
          date: "2026-07-10",
        },
        undefined,
        undefined,
        {},
      )) as { content: Array<{ text?: string }> };

      expect(String(result.content[0]?.text ?? "")).toContain("Stored memory entry");
      const updated = readFileSync(memoryPath, "utf8");
      expect(updated).toContain("- 2026-07-10 - Use hybrid backend. Why: reuse CLI indexing.");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
