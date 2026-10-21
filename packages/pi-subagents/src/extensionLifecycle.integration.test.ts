import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { emptyAgentUsageStats } from "./delegation/types";

// Only child assembly is synthetic. Parent lifecycle, extension API, registration,
// admission, terminal emission, delivery and parent model continuation are real.
vi.mock("./delegation", async (importOriginal) => {
  const core = await importOriginal<typeof import("./delegation")>();
  return {
    ...core,
    AgentManager: class extends core.AgentManager {
      constructor() {
        super({
          createAgentRun: async (options) => ({
            session: { subscribe: () => () => {} } as never,
            sessionId: "offline-child",
            completion: Promise.resolve({
              agentId: options.agentId,
              agentName: options.agentName,
              status: options.prompt.includes("fail") ? "failed" : "completed",
              responseText: "offline findings",
              error: options.prompt.includes("fail") ? "offline failure" : undefined,
              usage: emptyAgentUsageStats,
            }),
            cancel: async () => {},
            steer: async () => {},
          }),
        });
      }
    },
  };
});
import { createPiSubagentsExtension } from "./extension";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

it.each([
  { busy: false, fails: false },
  { busy: true, fails: false },
  { busy: false, fails: true },
])("real SDK session_start admits and returns instant slash results automatically (%j)", async ({ busy, fails }) => {
  initTheme();
  const cwd = await mkdtemp(join(tmpdir(), "subagents-lifecycle-"));
  cleanup.push(() => rm(cwd, { recursive: true, force: true }));
  const modelRuntime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const requests: Array<{ stream: ReturnType<typeof createAssistantMessageEventStream>; messages: unknown[] }> = [];
  modelRuntime.registerProvider("lifecycle-probe", {
    api: "lifecycle-offline",
    apiKey: "offline",
    baseUrl: "https://offline.invalid",
    streamSimple: (_model, context) => {
      const stream = createAssistantMessageEventStream();
      requests.push({ stream, messages: structuredClone(context.messages) });
      return stream;
    },
    models: [
      {
        id: "parent",
        name: "parent",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100000,
        maxTokens: 1000,
      },
    ],
  });
  cleanup.push(async () => modelRuntime.unregisterProvider("lifecycle-probe"));
  const model = modelRuntime.getModel("lifecycle-probe", "parent");
  if (!model) throw new Error("Offline model missing");
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [createPiSubagentsExtension],
  });
  await loader.reload();
  const manager = SessionManager.create(cwd, cwd);
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    modelRuntime,
    model,
    settingsManager,
    resourceLoader: loader,
    sessionManager: manager,
  });
  cleanup.push(async () => {
    await session.abort();
    session.dispose();
  });
  const errors: string[] = [];
  await session.bindExtensions({ onError: (error) => errors.push(error.error) });
  expect(session.getActiveToolNames()).toContain("Agent");
  const answer = (index: number) => {
    const request = requests[index];
    if (!request) throw new Error("Missing parent continuation");
    const message: AssistantMessage = {
      role: "assistant",
      api: model.api,
      provider: model.provider,
      model: model.id,
      content: [{ type: "text", text: "reviewed" }],
      stopReason: "stop",
      timestamp: Date.now(),
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    request.stream.push({ type: "start", partial: message });
    request.stream.push({ type: "done", reason: "stop", message });
    request.stream.end();
  };
  const running = busy ? session.prompt("Finish parent work first") : undefined;
  if (busy) await vi.waitFor(() => expect(requests).toHaveLength(1));
  // Foreground slash is enrolled for automatic completion delivery as well.
  await session.prompt(`/agent explore ${fails ? "fail" : "inspect"} offline`);
  const index = busy ? 1 : 0;
  if (busy) {
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0]?.messages)).not.toContain("offline findings");
    answer(0);
  }
  await vi.waitFor(() => expect(requests).toHaveLength(index + 1));
  expect(JSON.stringify(requests[index]?.messages)).toContain(fails ? "offline failure" : "offline findings");
  answer(index);
  await running;
  await session.waitForIdle();
  const completions = manager.buildSessionContext().messages.filter((message) => message.role === "custom");
  expect(completions).toEqual([expect.objectContaining({ customType: "subagent-completion", display: true })]);
  expect(errors).toEqual([]);
});
