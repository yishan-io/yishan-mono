import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function findTool(name: string) {
  const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }> = [];
  const pi = {
    registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
      tools.push(tool);
    },
  };
  registerMemoryTools(pi as never, { search: vi.fn(), reconcile: vi.fn() } as never);
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Expected ${name} tool`);
  }
  return tool;
}

describe("registerMemoryTools path guards", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    osHome.value = "";
  });

  it("rejects memory_store whose projectRoot is the .my-context directory itself", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-badroot-"));
    try {
      mkdirSync(join(tempRoot, ".my-context"), { recursive: true });

      await expect(
        findTool("memory_store").execute(
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

      await expect(
        findTool("memory_store").execute(
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

      await expect(
        findTool("memory_store").execute(
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

      const result = (await findTool("memory_store").execute(
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

  it("rejects memory_read whose projectRoot is a context root", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-read-nested-"));
    const fakeHome = join(tempRoot, "home");
    const contextRoot = join(fakeHome, ".yishan", "contexts", "my-repo");
    osHome.value = fakeHome;
    try {
      mkdirSync(contextRoot, { recursive: true });
      writeFileSync(join(contextRoot, "MEMORY.md"), "# Project Memory\n", "utf8");
      mkdirSync(join(contextRoot, ".my-context"), { recursive: true });

      await expect(
        findTool("memory_read").execute(
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

  it("migrates legacy headings when storing into an old-format MEMORY.md", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-legacy-"));
    try {
      mkdirSync(join(tempRoot, ".my-context"), { recursive: true });
      const memoryPath = join(tempRoot, ".my-context", "MEMORY.md");
      writeFileSync(
        memoryPath,
        "# Project Memory\n\n_Last updated: 2026-07-01_\n\n## Locked Decisions\n\n- 2026-07-01 - Old decision. Why: reason.\n\n## Durable Discoveries\n\n## Open Questions\n\n- 2026-07-01 — Should X?\n",
        "utf8",
      );

      await findTool("memory_store").execute(
        "tool-1",
        {
          projectRoot: tempRoot,
          section: "locked_decisions",
          entry: "New decision. Why: reason.",
          date: "2026-07-02",
        },
        undefined,
        undefined,
        {},
      );

      const updated = readFileSync(memoryPath, "utf8");
      // Legacy heading renamed in place — no dual "## Decisions" + "## Locked Decisions".
      expect(updated.match(/## Decisions/g) ?? []).toHaveLength(1);
      expect(updated).not.toContain("## Locked Decisions");
      // Retired section dropped.
      expect(updated).not.toContain("## Open Questions");
      // Old decision preserved, new entry appended.
      expect(updated).toContain("- 2026-07-01 - Old decision. Why: reason.");
      expect(updated).toContain("- 2026-07-02 - New decision. Why: reason.");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("walks up from the session cwd to the nearest project root", async () => {
    const tempRoot = mkdtempSync(join(os.tmpdir(), "pi-memory-store-cwdwalk-"));
    try {
      const repo = join(tempRoot, "repo");
      const src = join(repo, "src");
      mkdirSync(src, { recursive: true });
      mkdirSync(join(repo, ".my-context"), { recursive: true });

      await findTool("memory_store").execute(
        "tool-1",
        {
          section: "durable_discoveries",
          entry: "[Invariant] 2026-08-05 — cwd walks up to the project root.",
          date: "2026-08-05",
        },
        undefined,
        undefined,
        { cwd: src },
      );

      expect(readFileSync(join(repo, ".my-context", "MEMORY.md"), "utf8")).toContain(
        "cwd walks up to the project root.",
      );
      expect(existsSync(join(src, ".my-context"))).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
