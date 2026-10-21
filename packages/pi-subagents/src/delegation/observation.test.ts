import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  type AgentSession,
  type AgentSessionServices,
  SessionManager,
  type createAgentSessionFromServices,
} from "@earendil-works/pi-coding-agent";
import { expect, expectTypeOf, it, vi } from "vitest";
import type { AgentDefinition, AgentRunMode } from "../agents/types";
import { emptyAgentUsageStats } from "../agents/types";
import { AgentManager } from "../delegation";
import type { createChildAgentSession, startAgentRun } from "../index";
import { buildAgentTask } from "../runtime/buildAgentTask";
import type {
  ChildSessionDescriptor,
  ParentSessionReference,
  ParentSessionWriter,
} from "../runtime/sessionRelationship";
import { buildLiveTranscriptPayload } from "../ui/liveTranscriptPayload";

it("exposes only live observation getters, including replaced arrays, model, thinking and streaming edits", async () => {
  const initialModel: Model<Api> | undefined = getModel("anthropic", "claude-sonnet-4-5");
  const session = {
    messages: [{ role: "user", content: "before", timestamp: 1 }],
    model: initialModel,
    thinkingLevel: "off",
    subscribe: vi.fn(() => () => {}),
    abort: vi.fn(),
    prompt: vi.fn(),
    dispose: vi.fn(),
  };
  const manager = new AgentManager({
    createAgentRun: async () => ({
      session: session as unknown as AgentSession,
      sessionId: "child",
      completion: new Promise(() => {}),
      cancel: async () => {},
      steer: async () => {},
    }),
  });
  const id = await manager.runInBackground(
    buildAgentTask({
      agentName: "Explore",
      agentDefinition: { name: "Explore", description: "Explore", systemPrompt: "Explore", source: "builtin" },
      cwd: "/tmp",
      mode: "background",
      prompt: "Inspect",
    }),
  );
  const record = manager.get(id);
  expect(record?.session).toBeDefined();
  expect(Object.keys(record?.session ?? {}).sort()).toEqual(["messages", "model", "thinkingLevel"]);
  expect(record?.session?.messages).toBe(session.messages);
  session.messages = [{ role: "user", content: "replacement", timestamp: 2 }];
  session.thinkingLevel = "high";
  session.model = getModel("openai", "gpt-4o");
  expect(record?.session?.messages).toBe(session.messages);
  expect(record?.session?.model).toBe(session.model);
  expect(record?.session?.thinkingLevel).toBe("high");
  const streamingMessage = session.messages[0];
  if (!streamingMessage) throw new Error("Expected streaming message");
  streamingMessage.content += " streaming";
  const payload = buildLiveTranscriptPayload(record ? [record] : []).payload;
  expect(payload?.agents[0]).toMatchObject({
    thinkingLevel: "high",
    model: { id: "gpt-4o" },
    messages: [{ content: "replacement streaming" }],
  });
  expect(manager.get(id)?.usage).toEqual(emptyAgentUsageStats);
});

interface LegacyFactoryOptions {
  agentId: string;
  agentName: string;
  cwd: string;
  mode: AgentRunMode;
  parentSession?: ParentSessionReference;
  childSessionDescriptor?: ChildSessionDescriptor;
  agentDefinition: AgentDefinition;
  model?: string;
  parentModel?: NonNullable<Parameters<typeof createAgentSessionFromServices>[0]["model"]>;
  parentThinking?: ThinkingLevel;
  thinking?: ThinkingLevel;
  tools?: string[];
}
interface LegacyRunOptions extends LegacyFactoryOptions {
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
  parentSessionWriter?: ParentSessionWriter;
  parentToolCallId?: string;
}
it("retains public helper signatures and raw SDK session controls", () => {
  expectTypeOf<Parameters<typeof createChildAgentSession>[0]>().toEqualTypeOf<LegacyFactoryOptions>();
  expectTypeOf<Parameters<typeof startAgentRun>[0]>().toEqualTypeOf<LegacyRunOptions>();
  expectTypeOf<Awaited<ReturnType<typeof createChildAgentSession>>>().toEqualTypeOf<{
    session: AgentSession;
    services: AgentSessionServices;
    sessionId: string;
    sessionPath?: string;
  }>();
  expectTypeOf<Awaited<ReturnType<typeof startAgentRun>>>().toEqualTypeOf<{
    session: AgentSession;
    sessionId: string;
    sessionPath?: string;
    completion: Promise<import("../delegation").AgentResult>;
    cancel(): Promise<void>;
    steer(message: string): Promise<void>;
  }>();
  expectTypeOf<NonNullable<import("../delegation").AgentRecord["session"]>["messages"]>().toEqualTypeOf<
    readonly AgentMessage[]
  >();
});

it("maps role policy and late parent metadata into generic core hooks", () => {
  const task = buildAgentTask({
    agentName: "Explore",
    agentDefinition: {
      name: "Explore",
      description: "Explore",
      systemPrompt: "Role prompt",
      source: "builtin",
      model: "provider/model",
      thinking: "high",
      tools: ["read"],
      maxTurns: 3,
      timeoutMs: 100,
    },
    prompt: "Inspect auth",
    cwd: "/tmp/project",
    mode: "foreground",
  });
  task.parentSession = { sessionId: "parent", sessionPath: "/tmp/parent.jsonl", cwd: "/tmp/project" };
  task.parentToolCallId = "tool-1";
  task.parentSessionWriter = { recordChildSessionStarted: vi.fn(), recordChildSessionCompleted: vi.fn() };
  expect(task).toMatchObject({
    systemPrompt: "Role prompt",
    model: "provider/model",
    thinking: "high",
    maxTurns: 3,
    timeoutMs: 100,
    workspaceAccess: "read",
    parentSessionPath: "/tmp/parent.jsonl",
  });
  expect(task.resolveExtensions).toBeTypeOf("function");
  const child = SessionManager.inMemory("/tmp/project");
  const reference = {
    agentId: "agent-1",
    agentName: "Explore",
    mode: "foreground" as const,
    sessionId: child.getSessionId(),
  };
  task.onSessionCreated?.(child, reference);
  expect(child.getEntries()).toContainEqual(
    expect.objectContaining({
      type: "custom",
      customType: "pi-subagent-parent",
      data: expect.objectContaining({ agentId: "agent-1", parentSessionId: "parent", title: "Explore — Inspect auth" }),
    }),
  );
  task.onStarted?.({ ...reference, createdAt: "2026-01-01T00:00:00Z" });
  task.onCompleted?.({
    agentId: "agent-1",
    agentName: "Explore",
    sessionId: reference.sessionId,
    status: "completed",
    usage: emptyAgentUsageStats,
  });
  expect(task.parentSessionWriter.recordChildSessionStarted).toHaveBeenCalledWith(
    expect.objectContaining({ event: "started", parentToolCallId: "tool-1", childSessionId: reference.sessionId }),
  );
  expect(task.parentSessionWriter.recordChildSessionCompleted).toHaveBeenCalledWith(
    expect.objectContaining({ event: "completed", status: "completed", usage: emptyAgentUsageStats }),
  );
});
