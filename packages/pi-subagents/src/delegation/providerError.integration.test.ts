import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { CompletionOwner } from "../delivery/completionOwner";
import { AgentManager } from "./agentManager";
import { startDelegatedRun } from "./agentRunner";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

it.each(["error", "success", "overflow"] as const)(
  "classifies finalized SDK provider outcomes even after history removal (%s)",
  async (outcome) => {
    const fails = outcome !== "success";
    const overflow = outcome === "overflow";
    const providerError = overflow ? "prompt is too long: maximum context length exceeded" : "provider unavailable";
    const cwd = await mkdtemp(join(tmpdir(), "subagents-provider-error-"));
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));
    const modelRuntime = await ModelRuntime.create({
      authPath: join(cwd, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const assistant = (isError: boolean): AssistantMessage => ({
      role: "assistant",
      api: "provider-error-offline",
      provider: "provider-error-probe",
      model: "child",
      content: isError ? [] : [{ type: "text", text: "recovered" }],
      stopReason: isError ? "error" : "stop",
      errorMessage: isError ? providerError : undefined,
      timestamp: Date.now(),
      usage: {
        input: 2,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 3,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    modelRuntime.registerProvider("provider-error-probe", {
      api: "provider-error-offline",
      apiKey: "offline",
      baseUrl: "https://offline.invalid",
      streamSimple: () => {
        const stream = createAssistantMessageEventStream();
        const message = assistant(fails);
        stream.push({ type: "start", partial: message });
        if (fails) stream.push({ type: "error", reason: "error", error: message });
        else stream.push({ type: "done", reason: "stop", message });
        stream.end();
        return stream;
      },
      models: [
        {
          id: "child",
          name: "child",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 100000,
          maxTokens: 1000,
        },
      ],
    });
    cleanup.push(async () => modelRuntime.unregisterProvider("provider-error-probe"));
    const services = await createAgentSessionServices({
      cwd,
      agentDir: cwd,
      modelRuntime,
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: true }, retry: { enabled: false } }),
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      },
    });
    const sessionManager = SessionManager.create(cwd, cwd);
    // An older error must not override a successful final assistant in this run.
    if (!overflow) sessionManager.appendMessage(assistant(true));
    const { session } = await createAgentSessionFromServices({
      services,
      sessionManager,
      model: modelRuntime.getModel("provider-error-probe", "child"),
      tools: [],
    });
    cleanup.push(async () => session.dispose());
    const finalized: AssistantMessage[] = [];
    session.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") finalized.push(event.message);
    });
    const prompt = vi.spyOn(session, "prompt");
    const send = vi.fn();
    const owner = new CompletionOwner({ sessionId: "parent", lifetime: "current", send, warn: vi.fn() });
    const manager = new AgentManager({
      createAgentRun: (options) =>
        startDelegatedRun(options, async () => ({
          session,
          services,
          sessionId: sessionManager.getSessionId(),
          sessionPath: sessionManager.getSessionFile(),
        })),
    });
    const terminal = vi.fn();
    manager.subscribeTerminal(terminal);
    manager.subscribeTerminal((event) => owner.terminal(event));
    const result = await manager.run(
      {
        agentName: "probe",
        prompt: "inspect offline",
        cwd,
        systemPrompt: "test",
        mode: "foreground",
        workspaceAccess: "read",
      },
      { parent: owner.parent, onAdmitted: (id) => owner.enroll(id) },
    );

    // SDK 1.3 resolves prompt even though its finalized assistant reports an error.
    expect(prompt.mock.results).toHaveLength(1);
    await expect(prompt.mock.results[0]?.value).resolves.toBeUndefined();
    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({ stopReason: fails ? "error" : "stop" });
    if (overflow) {
      expect(session.messages.some((message) => message.role === "assistant")).toBe(false);
      expect(sessionManager.getEntries().some((entry) => entry.type === "context_edit")).toBe(true);
    } else {
      expect(session.messages.at(-1)).toMatchObject({ stopReason: fails ? "error" : "stop" });
    }
    expect(result).toMatchObject({
      status: fails ? "failed" : "completed",
      ...(fails ? { error: providerError } : {}),
      usage: overflow ? { input: 0, output: 0, turns: 0 } : { input: 4, output: 2, contextTokens: 3, turns: 2 },
      sessionId: sessionManager.getSessionId(),
      sessionPath: sessionManager.getSessionFile(),
    });
    expect(result.error).toBe(fails ? providerError : undefined);
    expect(terminal).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        result,
        parent: owner.parent,
        record: expect.objectContaining({ status: result.status, sessionId: result.sessionId, usage: result.usage }),
      }),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        customType: "subagent-completion",
        display: true,
        content: expect.stringContaining(
          fails ? `failed\n\nError: ${providerError}\n\n(no output)` : "completed\n\nrecovered",
        ),
      }),
      { deliverAs: "followUp", triggerTurn: true },
    );
    expect(send.mock.calls[0]?.[0].content).toContain(`Child transcript: ${result.sessionPath}`);
  },
);
