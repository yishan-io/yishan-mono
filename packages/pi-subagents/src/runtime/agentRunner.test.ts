import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createChildAgentSessionMock } = vi.hoisted(() => ({
  createChildAgentSessionMock: vi.fn(),
}));

vi.mock("./sessionFactory", () => ({
  createChildAgentSession: createChildAgentSessionMock,
}));

import { startAgentRun } from "./agentRunner";

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-subagents-runner-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function createMockSession(options: { abortRejects?: boolean; sessionPath?: string } = {}) {
  let listener: ((event: { type: string }) => void) | undefined;
  let resolvePrompt: (() => void) | undefined;
  const sessionPath = options.sessionPath ?? "/tmp/shared-sessions/child-session-1.jsonl";
  const abortMock = vi.fn(async () => {
    resolvePrompt?.();
    if (options.abortRejects) {
      throw new Error("abort failed");
    }
  });
  const session = {
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text: "Final answer" }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 1,
          cacheWrite: 2,
          totalTokens: 15,
          cost: { total: 0.25 },
        },
      },
    ],
    sessionManager: {
      getSessionId: () => "child-session-1",
      getSessionFile: () => sessionPath,
      getHeader: () => ({
        type: "session",
        id: "child-session-1",
        timestamp: "2026-07-11T00:00:00.000Z",
        cwd: "/tmp/project",
      }),
      getEntries: () => [
        { id: "entry-1", parentId: null, type: "session_info", timestamp: "2026-07-11T00:00:01.000Z", name: "Test" },
      ],
    },
    subscribe(nextListener: (event: { type: string }) => void) {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    },
    async prompt() {
      await new Promise<void>((resolve) => {
        resolvePrompt = resolve;
      });
    },
    abort: abortMock,
    steer: vi.fn(async () => {}),
    dispose: vi.fn(),
    emitTurnEnd() {
      listener?.({ type: "turn_end" });
    },
  };

  return { session, abortMock, sessionPath };
}

describe("startAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("completes a run, persists the child session, and records parent-child metadata", async () => {
    const tempDir = createTempDir();
    const sessionPath = join(tempDir, "child-session-1.jsonl");
    const { session } = createMockSession({ sessionPath });
    const parentSessionWriter = {
      recordChildSessionStarted: vi.fn(),
      recordChildSessionCompleted: vi.fn(),
    };
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
      sessionId: "child-session-1",
      sessionPath,
    });

    const handle = await startAgentRun({
      agentId: "agent-1",
      agentName: "Explore",
      prompt: "Inspect auth",
      cwd: "/tmp/project",
      mode: "foreground",
      parentSession: {
        sessionId: "parent-session-1",
        sessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
        cwd: "/tmp/project",
      },
      parentSessionWriter,
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        source: "builtin",
      },
    });

    session.abort();
    const result = await handle.completion;

    expect(parentSessionWriter.recordChildSessionStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        agentName: "Explore",
        mode: "foreground",
        childSessionId: "child-session-1",
        childSessionPath: sessionPath,
        parentSessionId: "parent-session-1",
        parentSessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
      }),
    );
    expect(parentSessionWriter.recordChildSessionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        agentName: "Explore",
        mode: "foreground",
        childSessionId: "child-session-1",
        childSessionPath: sessionPath,
        status: "completed",
      }),
    );
    expect(result).toEqual({
      agentId: "agent-1",
      agentName: "Explore",
      status: "completed",
      responseText: "Final answer",
      sessionId: "child-session-1",
      sessionPath,
      usage: {
        input: 10,
        output: 5,
        cacheRead: 1,
        cacheWrite: 2,
        cost: 0.25,
        contextTokens: 15,
        turns: 1,
      },
    });
    expect(existsSync(sessionPath)).toBe(true);
    expect(readFileSync(sessionPath, "utf8")).toBe(
      `${JSON.stringify({ type: "session", id: "child-session-1", timestamp: "2026-07-11T00:00:00.000Z", cwd: "/tmp/project" })}\n${JSON.stringify({ id: "entry-1", parentId: null, type: "session_info", timestamp: "2026-07-11T00:00:01.000Z", name: "Test" })}\n`,
    );
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("supports steering and cancellation", async () => {
    const { session, abortMock, sessionPath } = createMockSession();
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
      sessionId: "child-session-1",
      sessionPath,
    });

    const handle = await startAgentRun({
      agentId: "agent-2",
      agentName: "General",
      prompt: "Implement auth",
      cwd: "/tmp/project",
      mode: "foreground",
      agentDefinition: {
        name: "General",
        description: "Implement code",
        systemPrompt: "General prompt",
        source: "builtin",
      },
    });

    await handle.steer("Check tests too");
    await handle.cancel();
    const result = await handle.completion;

    expect(session.steer).toHaveBeenCalledWith("Check tests too");
    expect(abortMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      agentId: "agent-2",
      agentName: "General",
      status: "cancelled",
      error: "Agent run was cancelled",
      sessionId: "child-session-1",
      sessionPath,
    });
  });

  it("fails timed out runs and swallows abort rejections", async () => {
    vi.useFakeTimers();
    const { session, abortMock, sessionPath } = createMockSession({ abortRejects: true });
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
      sessionId: "child-session-1",
      sessionPath,
    });

    const handle = await startAgentRun({
      agentId: "agent-3",
      agentName: "Explore",
      prompt: "Inspect auth",
      cwd: "/tmp/project",
      mode: "foreground",
      timeoutMs: 50,
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        source: "builtin",
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await handle.completion;

    expect(abortMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      agentId: "agent-3",
      agentName: "Explore",
      status: "failed",
      error: "Agent run timed out",
      sessionId: "child-session-1",
      sessionPath,
    });
  });

  it("fails runs that exceed the configured max turns", async () => {
    const { session, abortMock, sessionPath } = createMockSession();
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
      sessionId: "child-session-1",
      sessionPath,
    });

    const handle = await startAgentRun({
      agentId: "agent-4",
      agentName: "General",
      prompt: "Implement auth work",
      cwd: "/tmp/project",
      mode: "foreground",
      maxTurns: 2,
      agentDefinition: {
        name: "General",
        description: "Implement code changes",
        systemPrompt: "General prompt",
        source: "builtin",
      },
    });

    session.emitTurnEnd();
    session.emitTurnEnd();
    const result = await handle.completion;

    expect(abortMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      agentId: "agent-4",
      agentName: "General",
      status: "failed",
      error: "Agent run exceeded max turns (2)",
      sessionId: "child-session-1",
      sessionPath,
    });
  });
});
