import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type AssistantMessage, type Context, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  type ExtensionAPI,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";

const PROVIDER = "sdk-completion-probe";
const MODEL = "offline-parent";
const COMPLETION = {
  customType: "subagent-completion",
  content: "Child finished: synthetic result",
  display: true,
  details: { childId: "child-1", usage: { input: 700, output: 300, totalTokens: 1000, cost: 9 } },
};
const PARENT_USAGE = {
  input: 10,
  output: 2,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 12,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
};

type Request = { context: Context; stream: ReturnType<typeof createAssistantMessageEventStream> };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function createProbe(pauseBeforeStart = false) {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let isFirstStart = true;
  const cwd = await mkdtemp(join(tmpdir(), "pi-sdk-completion-"));
  cleanups.push(() => rm(cwd, { recursive: true, force: true }));
  const modelRuntime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const requests: Request[] = [];
  modelRuntime.registerProvider(PROVIDER, {
    api: "completion-probe-api",
    apiKey: "offline-only",
    baseUrl: "https://offline.invalid",
    streamSimple: (_model, context) => {
      const stream = createAssistantMessageEventStream();
      requests.push({ context: { ...context, messages: structuredClone(context.messages) }, stream });
      return stream;
    },
    models: [
      {
        id: MODEL,
        name: MODEL,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100000,
        maxTokens: 1000,
      },
    ],
  });
  cleanups.push(async () => modelRuntime.unregisterProvider(PROVIDER));
  const registeredModel = modelRuntime.getModel(PROVIDER, MODEL);
  if (!registeredModel) throw new Error("Synthetic model was not registered");
  const model = registeredModel;
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  let extension: ExtensionAPI | undefined;
  const errors: string[] = [];
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Offline SDK compatibility probe",
    extensionFactories: [
      (pi) => {
        extension = pi;
        pi.on("before_agent_start", async () => {
          if (pauseBeforeStart && isFirstStart) {
            isFirstStart = false;
            entered.resolve();
            await release.promise;
          }
        });
      },
    ],
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
    tools: ["probe_work"],
    customTools: [
      {
        name: "probe_work",
        label: "Probe work",
        description: "Complete existing parent work",
        parameters: Type.Object({}),
        execute: async () => ({ content: [{ type: "text", text: "existing work completed" }], details: {} }),
      },
    ],
  });
  cleanups.push(async () => {
    release.resolve();
    for (const request of requests) request.stream.end();
    await session.abort();
    session.dispose();
  });
  await session.bindExtensions({ onError: (error) => errors.push(error.error) });
  if (!extension) throw new Error("Probe extension did not load");
  const pi = extension;
  const displayed: unknown[] = [];
  session.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "custom") displayed.push(event.message);
  });

  async function request(index: number) {
    await vi.waitFor(() => expect(requests).toHaveLength(index + 1));
    const next = requests[index];
    if (!next) throw new Error("Missing synthetic provider request");
    return next;
  }
  async function answer(index: number, toolCall = false) {
    const next = await request(index);
    const message: AssistantMessage = {
      role: "assistant",
      api: model.api,
      provider: PROVIDER,
      model: MODEL,
      content: toolCall
        ? [{ type: "toolCall", id: "work-1", name: "probe_work", arguments: {} }]
        : [{ type: "text", text: `parent response ${index + 1}` }],
      stopReason: toolCall ? "toolUse" : "stop",
      usage: structuredClone(PARENT_USAGE),
      timestamp: Date.now(),
    };
    next.stream.push({ type: "start", partial: message });
    next.stream.push({ type: "done", reason: toolCall ? "toolUse" : "stop", message });
    next.stream.end();
  }
  async function settle() {
    await session.waitForIdle();
    expect(errors).toEqual([]);
  }
  return { session, manager, pi, requests, request, answer, settle, displayed, entered, release };
}

function hasCompletion(context: Context) {
  return JSON.stringify(context.messages).includes(COMPLETION.content);
}

function expectParentUsage(session: Awaited<ReturnType<typeof createProbe>>["session"], responses: number) {
  const stats = session.getSessionStats();
  expect(stats.assistantMessages).toBe(responses);
  expect(stats.tokens).toEqual({
    input: responses * 10,
    output: responses * 2,
    cacheRead: 0,
    cacheWrite: 0,
    total: responses * 12,
  });
  expect(stats.cost).toBeCloseTo(responses * 0.03);
}

describe("project SDK custom completion compatibility (offline)", () => {
  it("resolves the SDK from this package, not the global harness", async () => {
    const packageRoot = new URL("../../node_modules/@earendil-works/pi-coding-agent/", import.meta.url);
    const expectedEntry = await realpath(new URL("dist/index.js", packageRoot));
    expect(import.meta.resolve("@earendil-works/pi-coding-agent")).toBe(pathToFileURL(expectedEntry).href);
    expect(expectedEntry).not.toContain("/.pi/agent/install/");
    const metadata: unknown = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
    expect(metadata).toMatchObject({ name: "@earendil-works/pi-coding-agent", version: "1.3.0" });
  });

  it("wakes an idle parent with followUp + triggerTurn, persists completion, and counts only parent usage", async () => {
    const probe = await createProbe();
    // Establish a persisted parent session before the background child completes.
    const initial = probe.session.prompt("Original parent work");
    await probe.answer(0);
    await initial;
    probe.pi.sendMessage(COMPLETION, { deliverAs: "followUp", triggerTurn: true });
    expect(hasCompletion((await probe.request(1)).context)).toBe(true);
    await probe.answer(1);
    await probe.settle();
    expect(probe.displayed).toEqual([expect.objectContaining({ ...COMPLETION, role: "custom" })]);
    expectParentUsage(probe.session, 2);

    const file = probe.manager.getSessionFile();
    if (!file) throw new Error("Expected persisted session path");
    const reopened = SessionManager.open(file);
    const completions = reopened.buildSessionContext().messages.filter((message) => message.role === "custom");
    expect(completions).toEqual([expect.objectContaining({ ...COMPLETION, role: "custom" })]);
    const entries = reopened.getEntries().filter((entry) => entry.type === "custom_message");
    expect(entries).toHaveLength(1);
    // Custom child usage remains data; it is not a second assistant usage record.
    expect(reopened.buildSessionContext().messages.filter((message) => message.role === "assistant")).toHaveLength(2);
  });

  it("queues busy completion after existing tool work and its final response, never as steering", async () => {
    const probe = await createProbe();
    const running = probe.session.prompt("Finish existing work before consuming child completion");
    await probe.request(0); // Provider is held open: completion arrives while parent is busy.
    expect(probe.session.isStreaming).toBe(true);
    probe.pi.sendMessage(COMPLETION, { deliverAs: "followUp", triggerTurn: true });
    await probe.answer(0, true);
    const continuation = await probe.request(1);
    expect(hasCompletion(continuation.context)).toBe(false);
    expect(continuation.context.messages).toContainEqual(
      expect.objectContaining({
        role: "toolResult",
        toolCallId: "work-1",
        isError: false,
        content: [{ type: "text", text: "existing work completed" }],
      }),
    );
    await probe.answer(1);
    const followUp = await probe.request(2);
    expect(hasCompletion(followUp.context)).toBe(true);
    expect(followUp.context.messages.at(-2)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "parent response 2" }],
    });
    await probe.answer(2);
    await running;
    await probe.settle();
    expect(probe.requests).toHaveLength(3);
    expect(probe.displayed).toHaveLength(1);
    expectParentUsage(probe.session, 3);
  });

  it("preserves the original instruction before completion arriving during paused before_agent_start", async () => {
    const probe = await createProbe(true);
    const original = "ORIGINAL_USER_INSTRUCTION";
    // Handle rejection immediately: the old SDK rejects the competing original prompt.
    const running = probe.session.prompt(original).then(
      () => ({ ok: true }),
      () => ({ ok: false }),
    );
    await probe.entered.promise;
    expect(probe.requests).toHaveLength(0);
    probe.pi.sendMessage(COMPLETION, { deliverAs: "followUp", triggerTurn: true });
    probe.release.resolve();
    const first = await probe.request(0);
    expect(JSON.stringify(first.context.messages)).toContain(original);
    expect(hasCompletion(first.context)).toBe(false);
    await probe.answer(0);
    const followUp = await probe.request(1);
    expect(JSON.stringify(followUp.context.messages)).toContain(original);
    expect(JSON.stringify(followUp.context.messages)).toContain("parent response 1");
    expect(hasCompletion(followUp.context)).toBe(true);
    await probe.answer(1);
    expect(await running).toEqual({ ok: true });
    await probe.settle();
    expect(probe.requests).toHaveLength(2);
    expect(probe.displayed).toHaveLength(1);
    expectParentUsage(probe.session, 2);
  });

  it("triggerTurn false stores and displays while idle without waking; the next prompt sees it", async () => {
    const probe = await createProbe();
    probe.pi.sendMessage(COMPLETION, { deliverAs: "followUp", triggerTurn: false });
    await probe.settle();
    expect(probe.requests).toHaveLength(0);
    expect(probe.session.isStreaming).toBe(false);
    expect(probe.displayed).toEqual([expect.objectContaining({ ...COMPLETION, role: "custom" })]);
    expect(probe.manager.buildSessionContext().messages).toContainEqual(
      expect.objectContaining({ ...COMPLETION, role: "custom" }),
    );
    expectParentUsage(probe.session, 0);
    const running = probe.session.prompt("Continue explicitly");
    expect(hasCompletion((await probe.request(0)).context)).toBe(true);
    await probe.answer(0);
    await running;
    await probe.settle();
    expectParentUsage(probe.session, 1);
  });
});
