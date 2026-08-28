import { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { type GenerateOptions, LlmAdapter, type StreamChunk, createUserMessage } from "@deepseek-ai/dsh-llm";
import { describe, expect, it, vi } from "vitest";

import { YishanSessionExecutionOwner } from "./sessionExecutionOwner";
import { BINDING, CWD } from "./sessionExecutionOwner.testSupport";

const SESSION_ID = "agent-loop-session";
const INITIAL_ROUTE = { provider: "first-provider", model: "first-model" };
const NEXT_ROUTE = { provider: "next-provider", model: "next-model" };

class DeterministicAdapter extends LlmAdapter {
  readonly inputs: Pick<GenerateOptions, "provider" | "model">[] = [];
  onFirstRequest: (() => Promise<void>) | undefined;

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.inputs.push({ provider: options.provider, model: options.model });
    if (this.inputs.length === 1) {
      await this.onFirstRequest?.();
      yield { type: "block-start", index: 0, blockType: "tool-call" };
      yield { type: "tool-call-delta", index: 0, id: "call-1" as never, name: "missing-tool", argumentsDelta: "{}" };
      yield {
        type: "block-end",
        index: 0,
        block: { type: "tool-call", id: "call-1" as never, name: "missing-tool", arguments: "{}" },
      };
      yield { type: "finish", reason: { kind: "tool-calls" } };
      return;
    }
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "done" };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

describe("Yishan provider switching through the DSH agent loop", () => {
  it("keeps a tool turn on its original route and changes the next user turn's header and adapter input", async () => {
    const context = new Context();
    await context.plugin(agentSpine, { workspaceContext: false });
    vi.spyOn(context.sessions, "flush").mockResolvedValue(true);
    const adapter = new DeterministicAdapter();
    context.llm.registerAdapter([INITIAL_ROUTE.provider, NEXT_ROUTE.provider], adapter);
    const owner = new YishanSessionExecutionOwner({
      agents: {
        get: (sessionId) => context.agents.get(sessionId as never),
        create: async (options) => await context.agents.create({ ...options, sessionId: options.sessionId as never }),
        resume: async (options) =>
          await context.agents.resume({ ...options, resumeSessionId: options.resumeSessionId as never }),
      },
      sessions: {
        get: (sessionId) => context.sessions.get(sessionId as never),
        flush: async (session) => await context.sessions.flush(session as never),
      },
      sessionPersistence: {
        readFrom: async () => ({ meta: { version: 0, id: SESSION_ID as never, createdAt: 1, cwd: CWD }, events: [] }),
      },
      notify: vi.fn(),
      validateProviderSelection: vi.fn(async () => undefined),
    });
    adapter.onFirstRequest = async () => await owner.setModel({ cwd: CWD, sessionId: SESSION_ID, ...NEXT_ROUTE });
    context.on("session/event", (session, event) => owner.handleSessionEvent(session as never, event as never));
    context.on("agent/inbox/claimed", ({ agent, message }) => owner.handleAgentInboxClaimed(agent.id, message));
    context.on(
      "agent/pre-step",
      async ({ agent, messages }, next) => await owner.handleAgentPreStep(agent.id, messages, next),
    );

    try {
      await owner.start({ cwd: CWD, sessionId: SESSION_ID, binding: BINDING, agentOptions: INITIAL_ROUTE });
      await owner.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "first" }] });
      await context.agents.get(SESSION_ID as never)?.whenIdle();
      await owner.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "second" }] });
      await context.agents.get(SESSION_ID as never)?.whenIdle();

      expect(adapter.inputs).toEqual([INITIAL_ROUTE, INITIAL_ROUTE, NEXT_ROUTE]);
      const requestHeaders = context.sessions
        .get(SESSION_ID as never)
        ?.events.filter((event) => event.type === "request/header")
        .map((event) => event.data);
      expect(requestHeaders).toEqual([
        expect.objectContaining({ reason: "initial", header: expect.objectContaining({ config: INITIAL_ROUTE }) }),
        expect.objectContaining({ reason: "change", header: expect.objectContaining({ config: NEXT_ROUTE }) }),
      ]);
    } finally {
      await owner.dispose();
      await context.fiber.dispose();
    }
  });

  it("keeps the old route for goal and tool followups after rejecting a user prompt, then activates the pending route", async () => {
    const context = new Context();
    await context.plugin(agentSpine, { workspaceContext: false });
    vi.spyOn(context.sessions, "flush").mockResolvedValue(true);
    const adapter = new DeterministicAdapter();
    context.llm.registerAdapter([INITIAL_ROUTE.provider, NEXT_ROUTE.provider], adapter);
    const owner = new YishanSessionExecutionOwner({
      agents: {
        get: (sessionId) => context.agents.get(sessionId as never),
        create: async (options) => await context.agents.create({ ...options, sessionId: options.sessionId as never }),
        resume: async (options) =>
          await context.agents.resume({ ...options, resumeSessionId: options.resumeSessionId as never }),
      },
      sessions: {
        get: (sessionId) => context.sessions.get(sessionId as never),
        flush: async (session) => await context.sessions.flush(session as never),
      },
      sessionPersistence: {
        readFrom: async () => ({ meta: { version: 0, id: SESSION_ID as never, createdAt: 1, cwd: CWD }, events: [] }),
      },
      notify: vi.fn(),
      validateProviderSelection: vi.fn(async () => undefined),
    });
    let hasRejectedUserPrompt = false;
    context.on("session/event", (session, event) => owner.handleSessionEvent(session as never, event as never));
    context.on("agent/inbox/claimed", ({ agent, message }) => owner.handleAgentInboxClaimed(agent.id, message));
    context.on(
      "agent/pre-step",
      async ({ agent, messages }, next) => await owner.handleAgentPreStep(agent.id, messages, next),
    );
    context.on("agent/pre-step", async ({ messages }, next) => {
      const decision = await next();
      if (!hasRejectedUserPrompt && messages.some((message) => message.source.kind === "user")) {
        hasRejectedUserPrompt = true;
        return { kind: "reject" };
      }
      return decision;
    });

    try {
      await owner.start({ cwd: CWD, sessionId: SESSION_ID, binding: BINDING, agentOptions: INITIAL_ROUTE });
      await owner.setModel({ cwd: CWD, sessionId: SESSION_ID, ...NEXT_ROUTE });
      await owner.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "reject this" }] });
      await context.agents.get(SESSION_ID as never)?.whenIdle();
      context.agents.get(SESSION_ID as never)?.followup(
        createUserMessage({
          content: [{ type: "text", text: "automatic goal round" }],
          source: { kind: "goal", goalId: "goal-1" as never, revision: 1, round: 1 },
        }),
      );
      await context.agents.get(SESSION_ID as never)?.whenIdle();
      await owner.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "accepted" }] });
      await context.agents.get(SESSION_ID as never)?.whenIdle();

      expect(adapter.inputs).toEqual([INITIAL_ROUTE, INITIAL_ROUTE, NEXT_ROUTE]);
    } finally {
      await owner.dispose();
      await context.fiber.dispose();
    }
  });
});
