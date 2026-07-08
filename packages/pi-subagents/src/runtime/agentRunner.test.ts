import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createChildAgentSessionMock, writeAgentTranscriptMock } = vi.hoisted(() => ({
  createChildAgentSessionMock: vi.fn(),
  writeAgentTranscriptMock: vi.fn(),
}));

vi.mock("./sessionFactory", () => ({
  createChildAgentSession: createChildAgentSessionMock,
}));

vi.mock("./transcript", () => ({
  writeAgentTranscript: writeAgentTranscriptMock,
}));

import { startAgentRun } from "./agentRunner";

function createMockSession(options: { abortRejects?: boolean } = {}) {
  let listener: ((event: { type: string }) => void) | undefined;
  let resolvePrompt: (() => void) | undefined;
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
      getHeader: () => ({ type: "session", id: "session-1", timestamp: 1, cwd: "/tmp/project" }),
      getEntries: () => [{ id: "entry-1", parentId: null, type: "session_info", timestamp: 2, name: "Test" }],
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

  return { session, abortMock };
}

describe("startAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAgentTranscriptMock.mockResolvedValue("/tmp/project/.pi/output/agents/agent-1.jsonl");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("completes a run and collects usage plus transcript metadata", async () => {
    const { session } = createMockSession();
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
    });

    const handle = await startAgentRun({
      agentId: "agent-1",
      agentName: "Explore",
      prompt: "Inspect auth",
      cwd: "/tmp/project",
      agentDefinition: {
        name: "Explore",
        description: "Search the codebase",
        systemPrompt: "Explore prompt",
        source: "builtin",
      },
    });

    session.abort();
    const result = await handle.completion;

    expect(writeAgentTranscriptMock).toHaveBeenCalledWith({
      cwd: "/tmp/project",
      agentId: "agent-1",
      header: { type: "session", id: "session-1", timestamp: 1, cwd: "/tmp/project" },
      entries: [{ id: "entry-1", parentId: null, type: "session_info", timestamp: 2, name: "Test" }],
    });
    expect(result).toEqual({
      agentId: "agent-1",
      agentName: "Explore",
      status: "completed",
      responseText: "Final answer",
      transcriptPath: "/tmp/project/.pi/output/agents/agent-1.jsonl",
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
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("supports steering and cancellation", async () => {
    const { session, abortMock } = createMockSession();
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
    });

    const handle = await startAgentRun({
      agentId: "agent-2",
      agentName: "General",
      prompt: "Implement auth",
      cwd: "/tmp/project",
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
    });
  });

  it("fails timed out runs and swallows abort rejections", async () => {
    vi.useFakeTimers();
    const { session, abortMock } = createMockSession({ abortRejects: true });
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
    });

    const handle = await startAgentRun({
      agentId: "agent-3",
      agentName: "Explore",
      prompt: "Inspect auth",
      cwd: "/tmp/project",
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
    });
  });

  it("fails runs that exceed the configured max turns", async () => {
    const { session, abortMock } = createMockSession();
    createChildAgentSessionMock.mockResolvedValue({
      session,
      services: {},
    });

    const handle = await startAgentRun({
      agentId: "agent-4",
      agentName: "General",
      prompt: "Implement auth work",
      cwd: "/tmp/project",
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
    });
  });
});
