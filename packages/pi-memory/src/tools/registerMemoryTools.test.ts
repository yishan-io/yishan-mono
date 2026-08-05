import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerMemoryTools } from "./registerMemoryTools";

// Per-test home dir used to make the extension's ~/.yishan/contexts guard
// hermetic: node:os is a builtin whose exports cannot be vi.spyOn'd, so we
// mock the module and route homedir() through this holder.
const osHome: { value: string } = { value: "" };

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => (osHome.value === "" ? actual.homedir() : osHome.value),
  };
});

describe("registerMemoryTools", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    osHome.value = "";
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
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-read-"));
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
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-read-escape-"));
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
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-"));
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

  it("rejects memory_store whose projectRoot is the .my-context directory itself", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-badroot-"));
    try {
      mkdirSync(join(tempRoot, ".my-context"), { recursive: true });

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

      await expect(
        tool.execute(
          "tool-1",
          {
            projectRoot: join(tempRoot, ".my-context"),
            section: "durable_discoveries",
            entry: "Should never land here.",
            date: "2026-08-03",
          },
          undefined,
          undefined,
          {},
        ),
      ).rejects.toThrow("projectRoot must be the project root");

      expect(existsSync(join(tempRoot, ".my-context", ".my-context", "MEMORY.md"))).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects memory_store whose projectRoot is a context root (nested .my-context already exists)", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-ctxroot-"));
    const fakeHome = join(tempRoot, "home");
    const contextRoot = join(fakeHome, ".yishan", "contexts", "my-repo");
    osHome.value = fakeHome;
    try {
      // A realistic context root: top-level MEMORY.md plus the nested duplicate
      // from the Aug 2026 incident (<contextRoot>/.my-context exists).
      mkdirSync(contextRoot, { recursive: true });
      writeFileSync(join(contextRoot, "MEMORY.md"), "# Project Memory\n", "utf8");
      mkdirSync(join(contextRoot, ".my-context"), { recursive: true });

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

      await expect(
        tool.execute(
          "tool-1",
          {
            projectRoot: contextRoot,
            section: "durable_discoveries",
            entry: "Should never land here.",
            date: "2026-08-03",
          },
          undefined,
          undefined,
          {},
        ),
      ).rejects.toThrow("projectRoot must be the project root");
    } finally {
      osHome.value = "";
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects memory_store whose projectRoot is a fresh empty context root (no MEMORY.md)", async () => {
    // Regression: ensureContextLink creates context roots EMPTY at workspace
    // provisioning, so a top-level-MEMORY.md existence heuristic would miss this
    // case and recreate <contextRoot>/.my-context/MEMORY.md — the exact incident.
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-emptyctx-"));
    const fakeHome = join(tempRoot, "home");
    const contextRoot = join(fakeHome, ".yishan", "contexts", "my-repo");
    osHome.value = fakeHome;
    try {
      mkdirSync(contextRoot, { recursive: true });

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

      await expect(
        tool.execute(
          "tool-1",
          {
            projectRoot: contextRoot,
            section: "durable_discoveries",
            entry: "Should never land here.",
            date: "2026-08-03",
          },
          undefined,
          undefined,
          {},
        ),
      ).rejects.toThrow("projectRoot must be the project root");

      expect(existsSync(join(contextRoot, ".my-context", "MEMORY.md"))).toBe(false);
    } finally {
      osHome.value = "";
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("allows a project root under ~/.yishan/worktrees", async () => {
    // Worktrees live under ~/.yishan/worktrees/, NOT the contexts store — they
    // must not be over-rejected by the Yishan-store guard.
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-worktree-"));
    const fakeHome = join(tempRoot, "home");
    const worktree = join(fakeHome, ".yishan", "worktrees", "my-repo", "ws");
    osHome.value = fakeHome;
    try {
      mkdirSync(join(worktree, ".my-context"), { recursive: true });

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
          projectRoot: worktree,
          section: "durable_discoveries",
          entry: "[Invariant] 2026-08-05 — worktrees under ~/.yishan are valid project roots.",
          date: "2026-08-05",
        },
        undefined,
        undefined,
        {},
      )) as { content: Array<{ text?: string }> };

      expect(String(result.content[0]?.text ?? "")).toContain("Stored memory entry");
      const updated = readFileSync(join(worktree, ".my-context", "MEMORY.md"), "utf8");
      expect(updated).toContain("worktrees under ~/.yishan are valid project roots.");
    } finally {
      osHome.value = "";
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("creates .my-context on the first store call when it does not exist", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-first-"));
    try {
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
          section: "durable_discoveries",
          entry: "First store call creates .my-context?",
          date: "2026-08-05",
        },
        undefined,
        undefined,
        {},
      )) as { content: Array<{ text?: string }> };

      expect(String(result.content[0]?.text ?? "")).toContain("Stored memory entry");
      expect(existsSync(join(tempRoot, ".my-context", "MEMORY.md"))).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes through the .my-context symlink into the canonical context root", async () => {
    // Production layout: <worktree>/.my-context is a symlink to the canonical
    // context root; stores must land in the canonical root.
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-symlink-"));
    try {
      const canonical = join(tempRoot, "canonical-context");
      const worktree = join(tempRoot, "worktree");
      mkdirSync(canonical, { recursive: true });
      mkdirSync(worktree, { recursive: true });
      symlinkSync(canonical, join(worktree, ".my-context"), "dir");

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
          projectRoot: worktree,
          section: "durable_discoveries",
          entry: "[Invariant] 2026-08-05 — stores write through the .my-context symlink.",
          date: "2026-08-05",
        },
        undefined,
        undefined,
        {},
      )) as { content: Array<{ text?: string }> };

      expect(String(result.content[0]?.text ?? "")).toContain("Stored memory entry");
      expect(readFileSync(join(canonical, "MEMORY.md"), "utf8")).toContain(
        "stores write through the .my-context symlink.",
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("defaults projectRoot to the session working directory", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-cwd-"));
    try {
      mkdirSync(join(tempRoot, ".my-context"), { recursive: true });

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
          section: "durable_discoveries",
          entry: "[Invariant] 2026-08-05 — projectRoot defaults to the session cwd.",
          date: "2026-08-05",
        },
        undefined,
        undefined,
        { cwd: tempRoot },
      )) as { content: Array<{ text?: string }> };

      expect(String(result.content[0]?.text ?? "")).toContain("Stored memory entry");
      const updated = readFileSync(join(tempRoot, ".my-context", "MEMORY.md"), "utf8");
      expect(updated).toContain("projectRoot defaults to the session cwd.");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("requires projectRoot when the session working directory is unavailable", async () => {
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

    await expect(
      tool.execute(
        "tool-1",
        { section: "durable_discoveries", entry: "nope", date: "2026-08-05" },
        undefined,
        undefined,
        {},
      ),
    ).rejects.toThrow("projectRoot is required");
  });

  it("rejects memory_read whose projectRoot is a context root", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-read-nested-"));
    const fakeHome = join(tempRoot, "home");
    const contextRoot = join(fakeHome, ".yishan", "contexts", "my-repo");
    osHome.value = fakeHome;
    try {
      mkdirSync(contextRoot, { recursive: true });
      writeFileSync(join(contextRoot, "MEMORY.md"), "# Project Memory\n", "utf8");
      mkdirSync(join(contextRoot, ".my-context"), { recursive: true });

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
            projectRoot: contextRoot,
            path: "MEMORY.md",
          },
          undefined,
          undefined,
          {},
        ),
      ).rejects.toThrow("projectRoot must be the project root");
    } finally {
      osHome.value = "";
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
