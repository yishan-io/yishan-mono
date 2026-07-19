import { describe, expect, it, vi } from "vitest";

import type { AgentDefinition, AgentTask } from "../agents/types";
import { registerAgentTool } from "./agentTool";

const testAgentDefinition: AgentDefinition = {
  name: "Explore",
  description: "Search the codebase",
  systemPrompt: "Explore prompt",
  source: "builtin",
  tools: ["read", "grep"],
  readOnly: true,
};

function createToolHarness() {
  let registeredTool:
    | {
        execute: (
          toolCallId: string,
          params: { agent: string; prompt: string; background?: boolean },
          signal?: AbortSignal,
          onUpdate?: unknown,
          ctx?: unknown,
        ) => Promise<unknown>;
        description?: string;
        promptSnippet?: string;
        promptGuidelines?: string[];
        renderResult?: (result: unknown, options: { expanded: boolean; isPartial: boolean }, theme: unknown) => unknown;
      }
    | undefined;

  const pi = {
    registerTool(tool: {
      execute: (
        toolCallId: string,
        params: { agent: string; prompt: string; background?: boolean },
        signal?: AbortSignal,
        onUpdate?: unknown,
        ctx?: unknown,
      ) => Promise<unknown>;
      description?: string;
      promptSnippet?: string;
      promptGuidelines?: string[];
      renderResult?: (result: unknown, options: { expanded: boolean; isPartial: boolean }, theme: unknown) => unknown;
    }) {
      registeredTool = tool;
    },
  };

  return {
    pi,
    getRegisteredTool() {
      if (!registeredTool) {
        throw new Error("Expected Agent tool to be registered");
      }
      return registeredTool;
    },
  };
}

describe("registerAgentTool", () => {
  it("registers stronger delegation guidance for the model", () => {
    const { pi, getRegisteredTool } = createToolHarness();
    registerAgentTool(pi as never, { reload: vi.fn(), getByName: vi.fn() } as never, { run: vi.fn() } as never);

    expect(getRegisteredTool()).toMatchObject({
      description:
        "Delegate independent research or implementation work to one named sub-agent using the shared agent manager.",
      promptSnippet:
        "Use Agent for focused sub-tasks, especially codebase exploration, specialist review, or isolated code changes.",
      promptGuidelines: expect.arrayContaining([
        expect.stringContaining("do not use it for a single file read"),
        expect.stringContaining("state whether the sub-agent should do research or modify code"),
        expect.stringContaining("do not duplicate the same exploration or edits yourself"),
        expect.stringContaining("background=true only when the work can continue asynchronously"),
      ]),
    });
  });

  it("runs the requested agent through the shared manager and forwards parent session metadata", async () => {
    const { pi, getRegisteredTool } = createToolHarness();
    const appendCustomEntryMock = vi.fn();
    const registry = {
      reload: vi.fn(),
      getByName: vi.fn(() => testAgentDefinition),
    };
    let capturedTask: AgentTask | undefined;
    const manager = {
      run: vi.fn(async (task: AgentTask) => {
        capturedTask = task;
        return {
          agentId: "agent-1",
          agentName: "Explore",
          status: "completed",
          responseText: "Done",
          sessionId: "child-session-1",
          sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            cost: 0,
            contextTokens: 0,
            turns: 0,
          },
        };
      }),
    };

    registerAgentTool(pi as never, registry as never, manager as never);
    const result = await getRegisteredTool().execute(
      "tool-1",
      { agent: "Explore", prompt: "Inspect auth" },
      undefined,
      undefined,
      {
        cwd: "/tmp/project",
        sessionManager: {
          getSessionId: () => "parent-session-1",
          getSessionFile: () => "/tmp/shared-sessions/parent-session-1.jsonl",
          appendCustomEntry: appendCustomEntryMock,
        },
      },
    );

    expect(manager.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "Explore",
        agentDefinition: testAgentDefinition,
        prompt: "Inspect auth",
        cwd: "/tmp/project",
        mode: "foreground",
        tools: ["read", "grep"],
        model: undefined,
        thinking: undefined,
        maxTurns: undefined,
        timeoutMs: undefined,
        workspaceAccess: "read",
        parentSession: {
          sessionId: "parent-session-1",
          sessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
          cwd: "/tmp/project",
        },
      }),
    );

    const runTask = capturedTask;
    if (!runTask?.parentSessionWriter) {
      throw new Error("Expected parentSessionWriter to be attached to the delegated task");
    }
    runTask.parentSessionWriter.recordChildSessionStarted({
      version: 1,
      event: "started",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      title: "Explore",
      childSessionId: "child-session-1",
      childSessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
      parentSessionId: "parent-session-1",
      parentSessionPath: "/tmp/shared-sessions/parent-session-1.jsonl",
      createdAt: "2026-07-11T00:00:00.000Z",
    });
    runTask.parentSessionWriter.recordChildSessionCompleted({
      version: 1,
      event: "completed",
      agentId: "agent-1",
      agentName: "Explore",
      mode: "foreground",
      title: "Explore",
      childSessionId: "child-session-1",
      childSessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
      status: "completed",
      completedAt: "2026-07-11T00:01:00.000Z",
      usage: {
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        cost: 5,
        contextTokens: 6,
        turns: 7,
      },
    });

    expect(appendCustomEntryMock).toHaveBeenNthCalledWith(
      1,
      "pi-subagent-child",
      expect.objectContaining({
        version: 1,
        event: "started",
        agentId: "agent-1",
        childSessionId: "child-session-1",
        childSessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
      }),
    );
    expect(appendCustomEntryMock).toHaveBeenNthCalledWith(
      2,
      "pi-subagent-child",
      expect.objectContaining({
        version: 1,
        event: "completed",
        agentId: "agent-1",
        childSessionId: "child-session-1",
        status: "completed",
      }),
    );
    expect(result).toEqual({
      content: [{ type: "text", text: "Done" }],
      details: {
        agentId: "agent-1",
        mode: "foreground",
        sessionId: "child-session-1",
        sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
        status: "completed",
      },
    });
  });

  it("renders compact collapsed output and full expanded output", () => {
    const { pi, getRegisteredTool } = createToolHarness();
    registerAgentTool(pi as never, { reload: vi.fn(), getByName: vi.fn() } as never, { run: vi.fn() } as never);

    const renderResult = getRegisteredTool().renderResult;
    if (!renderResult) {
      throw new Error("Expected renderResult to be registered");
    }

    const theme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    };
    const collapsedComponent = renderResult(
      {
        content: [{ type: "text", text: "Full sub-agent output" }],
        details: {
          agentId: "agent-1",
          mode: "foreground",
          sessionId: "child-session-1",
          sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
          status: "completed",
        },
      },
      { expanded: false, isPartial: false },
      theme,
    ) as { render(width: number): string[] };
    const expandedComponent = renderResult(
      {
        content: [{ type: "text", text: "Full sub-agent output" }],
        details: {
          agentId: "agent-1",
          mode: "foreground",
          sessionId: "child-session-1",
          sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
          status: "completed",
        },
      },
      { expanded: true, isPartial: false },
      theme,
    ) as { render(width: number): string[] };

    expect(collapsedComponent.render(120).join("\n")).toContain("completed · agent-1");
    expect(collapsedComponent.render(120).join("\n")).not.toContain("Full sub-agent output");
    expect(expandedComponent.render(120).join("\n")).toContain("Full sub-agent output");
    expect(expandedComponent.render(120).join("\n")).toContain("session: /tmp/shared-sessions/child-session-1.jsonl");
  });
});
