import { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { CallId, type GenerateOptions, LlmAdapter, type StreamChunk } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceBindingHost } from "@yishan-io/dsh-workspace";

import { SessionRuntime } from "./runtime";
import { BINDING, CWD, createHarness, createTransport } from "./runtime.testSupport";

describe("Yishan provider switching", () => {
  it("releases an admitted identity when model validation rejects session creation", async () => {
    const harness = createHarness();
    const otherWorkspaceBinding = { ...BINDING, workspaceId: "workspace-2", cwd: "/other" };

    await expect(
      harness.runtime.start({
        cwd: CWD,
        sessionId: "reused-session",
        binding: BINDING,
        agentOptions: { provider: "unknown-provider", model: "unknown-model" },
      }),
    ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });

    await expect(
      harness.runtime.start({
        cwd: "/other",
        sessionId: "reused-session",
        binding: otherWorkspaceBinding,
        agentOptions: { provider: "deepseek-official", model: "first-model" },
      }),
    ).resolves.toMatchObject({ sessionId: "reused-session" });
  });

  it("validates the effective start selection before creating or persisting a session", async () => {
    const harness = createHarness();

    await expect(
      harness.runtime.start({
        cwd: CWD,
        sessionId: "one",
        binding: BINDING,
        agentOptions: { provider: "unknown-provider", model: "unknown-model" },
      }),
    ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.flush).not.toHaveBeenCalled();
  });

  it("rejects an invalid provider/model route when changing a live session", async () => {
    const harness = createHarness();
    await harness.runtime.start({
      cwd: CWD,
      sessionId: "one",
      binding: BINDING,
      agentOptions: { provider: "deepseek-official", model: "first-model" },
    });

    await expect(
      harness.runtime.setModel({ cwd: CWD, sessionId: "one", model: "unknown-model" }),
    ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });
  });
});

const SESSION_ID = "agent-loop-session";
const INITIAL_ROUTE = { provider: "deepseek-official", model: "first-model" };
const NEXT_ROUTE = { provider: "deepseek-official", model: "next-model" };

class DeterministicAdapter extends LlmAdapter {
  readonly inputs: Pick<GenerateOptions, "provider" | "model">[] = [];
  onFirstRequest: (() => Promise<void>) | undefined;

  async listModels(provider: string) {
    return [INITIAL_ROUTE.model, NEXT_ROUTE.model].map((id) => ({ provider, id, name: id }));
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.inputs.push({ provider: options.provider, model: options.model });
    if (this.inputs.length === 1) {
      await this.onFirstRequest?.();
      yield { type: "block-start", index: 0, blockType: "tool-call" };
      yield { type: "tool-call-delta", index: 0, id: CallId("call-1"), name: "missing-tool", argumentsDelta: "{}" };
      yield {
        type: "block-end",
        index: 0,
        block: { type: "tool-call", id: CallId("call-1"), name: "missing-tool", arguments: "{}" },
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
  it("keeps the assembled request stable and uses the changed selection for a later DSH step", async () => {
    const context = new Context();
    await context.plugin(agentSpine, { workspaceContext: false });
    new WorkspaceBindingHost(context, {
      resolveWorkspaceBinding: async ({ workspaceId }) => ({
        workspaceId,
        cwd: "/workspace",
        generation: 1,
        policy: { authorization: "daemon-authorized" },
      }),
    });
    vi.spyOn(context.sessions, "flush").mockResolvedValue(true);
    const adapter = new DeterministicAdapter();
    context.llm.registerAdapter([INITIAL_ROUTE.provider], adapter);
    const runtime = new SessionRuntime(context, createTransport(), async ({ provider, model }) => {
      if (provider !== "deepseek-official" || !["model", "first-model", "next-model"].includes(model))
        throw Object.assign(new Error("invalid provider"), { code: "YISHAN_PROVIDER_SELECTION_INVALID" });
    });
    adapter.onFirstRequest = async () => await runtime.setModel({ cwd: CWD, sessionId: SESSION_ID, ...NEXT_ROUTE });
    context.on("session/event", (session, event) => runtime.handleSessionEvent(session, event));

    try {
      await runtime.start({ cwd: CWD, sessionId: SESSION_ID, binding: BINDING, agentOptions: INITIAL_ROUTE });
      await runtime.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "first" }] });
      await context.agents.get(SessionId(SESSION_ID))?.whenIdle();
      await runtime.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "second" }] });
      await context.agents.get(SessionId(SESSION_ID))?.whenIdle();

      expect(adapter.inputs).toEqual([INITIAL_ROUTE, NEXT_ROUTE, NEXT_ROUTE]);
      const requestHeaders = context.sessions
        .get(SessionId(SESSION_ID))
        ?.events.filter((event) => event.type === "request/header")
        .map((event) => event.data);
      expect(requestHeaders).toEqual([
        expect.objectContaining({ reason: "initial", header: expect.objectContaining({ config: INITIAL_ROUTE }) }),
        expect.objectContaining({ reason: "change", header: expect.objectContaining({ config: NEXT_ROUTE }) }),
      ]);
    } finally {
      await runtime.dispose();
      await context.fiber.dispose();
    }
  });
});
