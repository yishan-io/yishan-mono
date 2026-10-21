import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionManager } from "@earendil-works/pi-coding-agent";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...sdk,
    createAgentSessionServices: vi.fn(async () => ({})),
    createAgentSessionFromServices: vi.fn(async () => ({ session: {} })),
  };
});
vi.mock("@yishan-io/pi-lsp", () => ({ createPiLspExtension: () => {} }));

import { createDelegatedSession } from "../delegation";
import { createChildAgentSession } from "./sessionFactory";

describe("child session storage", () => {
  let agentDir: string;
  let cwd: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-subagent-storage-"));
    cwd = join(agentDir, "project");
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(agentDir, { recursive: true, force: true });
  });

  it("reports a throwing generic session adapter without preventing assembly", async () => {
    const report = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await createDelegatedSession({
        cwd,
        agentId: "one",
        agentName: "test",
        mode: "foreground",
        systemPrompt: "test",
        onSessionCreated: () => {
          throw new Error("adapter");
        },
      });
      expect(result.sessionId).toEqual(expect.any(String));
      expect(result.sessionId.length).toBeGreaterThan(0);
      expect(report).toHaveBeenCalled();
    } finally {
      report.mockRestore();
    }
  });

  it("resolves the default directory without persisting a phantom transcript", () => {
    const manager = SessionManager.create(cwd);
    const sessionPath = manager.getSessionFile();
    assert(sessionPath);
    expect(manager.getSessionDir()).toBe(dirname(sessionPath));
    expect(existsSync(sessionPath)).toBe(false);
    expect(readdirSync(manager.getSessionDir())).toEqual([]);
  });

  it.each(["parent", "no parent", "nested parent", "custom parent"])(
    "stores a child under the cwd default subagents directory with %s",
    async (parentKind) => {
      const defaultDir = SessionManager.create(cwd).getSessionDir();
      const childDir = join(defaultDir, "subagents");
      const parentSessionPath =
        parentKind === "no parent"
          ? undefined
          : join(
              parentKind === "custom parent"
                ? join(agentDir, "unrelated-cwd", "custom-sessions")
                : parentKind === "nested parent"
                  ? childDir
                  : defaultDir,
              "parent.jsonl",
            );
      const parentSession = parentSessionPath
        ? { sessionId: "parent-id", sessionPath: parentSessionPath, cwd: "/unrelated-parent-cwd" }
        : undefined;
      const created = await createChildAgentSession({
        cwd,
        agentId: "explore-id",
        agentName: "Explore",
        mode: "foreground",
        parentSession,
        agentDefinition: {
          name: "Explore",
          description: "Explore the project",
          systemPrompt: "Explore prompt",
          source: "builtin",
        },
      });

      const sessionPath = created.sessionPath;
      assert(sessionPath);
      expect(dirname(sessionPath)).toBe(childDir);
      expect(readdirSync(defaultDir)).toEqual(["subagents"]);
      expect(readdirSync(childDir)).toEqual([]);

      // Flush the real child manager with an assistant message, as Pi does on a turn.
      const { createAgentSessionFromServices } = await import("@earendil-works/pi-coding-agent");
      const creationOptions = vi.mocked(createAgentSessionFromServices).mock.calls.at(-1)?.[0];
      const manager = creationOptions?.sessionManager;
      assert(manager);
      expect(created.sessionId).toBe(manager.getSessionId());
      expect(created.sessionPath).toBe(manager.getSessionFile());
      manager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "test-model",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      });
      const entries: unknown[] = readFileSync(sessionPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(entries[0]).toEqual(expect.objectContaining({ cwd, id: created.sessionId }));
      if (parentSessionPath) expect(entries[0]).toHaveProperty("parentSession", parentSessionPath);
      else expect(entries[0]).not.toHaveProperty("parentSession");
      expect(entries).toContainEqual(
        expect.objectContaining({
          type: "custom",
          customType: "pi-subagent-parent",
          data: expect.objectContaining({
            childSessionId: created.sessionId,
            childSessionPath: created.sessionPath,
            ...(parentSessionPath ? { parentSessionId: "parent-id", parentSessionPath } : {}),
          }),
        }),
      );
      expect(readdirSync(defaultDir)).toEqual(["subagents"]);
      expect(readdirSync(childDir)).toEqual([basename(sessionPath)]);
    },
  );
});
