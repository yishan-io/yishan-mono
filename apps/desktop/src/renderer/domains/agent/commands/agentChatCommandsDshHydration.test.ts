// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { dshStartResult } from "../runtime/agentSessionRuntime.dsh.testSupport";
import { agentChatStore } from "../state/agentChatStore";
import { loadDSHSessionModels, startAgentChatSession } from "./agentChatCommands";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(), attachAgent: vi.fn(), promptAgent: vi.fn(), abortAgent: vi.fn(), disposeAgent: vi.fn(),
  send: vi.fn(), listSessions: vi.fn(), listActiveSessions: vi.fn(), getSessionFile: vi.fn(), listModels: vi.fn(),
  listDSHProviders: vi.fn(), listProviders: vi.fn(), removeProvider: vi.fn(), rename: vi.fn(), runChatPrompt: vi.fn(),
  saveProvider: vi.fn(), closeAgentSession: vi.fn(), ensureChatSession: vi.fn(), getDetectionStatuses: vi.fn(),
  listDetectionStatuses: vi.fn(), getCapabilities: vi.fn(), listSessionLineage: vi.fn(), readHistory: vi.fn(),
  registerDshRouter: vi.fn(() => () => {}),
}));
const openChatMocks = vi.hoisted(() => ({ resolveChatFilePath: vi.fn() }));

vi.mock("@shared/ids/generateId", () => ({ generateId: vi.fn(() => "generated-session-id") }));
vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()), registerAgentChatEventRouter: vi.fn(() => () => {}),
}));
vi.mock("../subscriptions/agentChatDSHEventRouter", () => ({ registerAgentChatDSHEventRouter: mocks.registerDshRouter }));
vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}), attachAgentSession: mocks.attachAgent, abortAgentSession: mocks.abortAgent,
  disposeAgentSession: mocks.disposeAgent, getAgentCapabilities: mocks.getCapabilities, promptAgentSession: mocks.promptAgent,
  startAgentSession: mocks.startAgent, closeAgentSession: mocks.closeAgentSession, ensureWorkspaceChatSession: mocks.ensureChatSession,
  listActivePiCompatibilitySessions: mocks.listActiveSessions, listAgentDetectionStatuses: mocks.listDetectionStatuses,
  listAgentSessionLineage: mocks.listSessionLineage, readAgentRuntimeHistory: mocks.readHistory, listAgentModels: mocks.listModels,
  listDSHProviders: mocks.listDSHProviders, listPiProviders: mocks.listProviders, removePiProvider: mocks.removeProvider,
  renamePiCompatibilitySession: mocks.rename, runWorkspaceChatPrompt: mocks.runChatPrompt, savePiProvider: mocks.saveProvider,
  sendPiCompatibilityCommand: mocks.send,
}));
vi.mock("../../files/commands/fileCommands", () => ({ resolveChatFilePath: openChatMocks.resolveChatFilePath }));
vi.mock("../../workspace/state/workspaceActions", () => ({ enqueueWorkspaceErrorNotice: vi.fn() }));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
});

describe("agentChatCommands.startAgentChatSession DSH hydration", () => {
  it("opens a DSH child detail from its durable transcript without creating a top-level owner", async () => {
    mocks.readHistory.mockResolvedValue({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "dsh-child", createdAt: 0, parentSession: "dsh-parent", origin: "subagent" },
        instanceId: "child-run-1",
        events: [
          { type: "dsh/hidden.v1", seq: 0, time: 0, data: { version: 1 }, ignorable: true },
          {
            type: "user/message",
            seq: 1,
            time: 1,
            data: {
              id: "child-request",
              role: "user",
              content: [{ type: "text", text: "Inspect the workspace" }],
              source: { kind: "user" },
            },
            surfaceOp: "append",
          },
          { type: "dsh/hidden.v1", seq: 2, time: 2, data: { version: 1 }, ignorable: true },
        ],
        asOfSeq: 2,
        durableThroughSeq: 2,
      },
    });

    await startAgentChatSession({
      tabId: "dsh-child-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      runtime: "dsh",
      sessionId: "dsh-child",
      sessionView: "subagent-detail",
      subagentParentSessionId: "dsh-parent",
    });

    expect(mocks.readHistory).toHaveBeenCalledWith({
      runtime: "dsh",
      sessionId: "dsh-child",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
    expect(mocks.startAgent).not.toHaveBeenCalled();
    expect(mocks.attachAgent).not.toHaveBeenCalled();
    expect(mocks.registerDshRouter).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["dsh-child-tab"]).toMatchObject({
      sessionId: "dsh-child",
      state: "idle",
      messages: [expect.objectContaining({ id: "child-request" })],
    });
  });

  it.each([
    ["session ID", undefined, "dsh-parent"],
    ["parent session ID", "dsh-child", undefined],
  ])(
    "rejects a DSH child detail without its required %s before managed startup",
    async (_, sessionId, parentSessionId) => {
      await startAgentChatSession({
        tabId: "dsh-child-tab",
        workspaceId: "workspace-1",
        cwd: "/workspace",
        runtime: "dsh",
        sessionId,
        sessionView: "subagent-detail",
        subagentParentSessionId: parentSessionId,
      });

      expect(mocks.readHistory).not.toHaveBeenCalled();
      expect(mocks.startAgent).not.toHaveBeenCalled();
      expect(mocks.attachAgent).not.toHaveBeenCalled();
      expect(agentChatStore.getState().sessionsByTabId["dsh-child-tab"]?.error).toBe(
        "DSH subagent detail requires a session ID and parent session ID",
      );
    },
  );

  it("rejects unknown DSH events in a read-only child transcript", async () => {
    mocks.readHistory.mockResolvedValue({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "dsh-child", createdAt: 0, parentSession: "dsh-parent", origin: "subagent" },
        instanceId: "child-run-1",
        events: [{ type: "subagent/unknown", seq: 0, time: 0, data: {} }],
        asOfSeq: 0,
        durableThroughSeq: 0,
      },
    });

    await startAgentChatSession({
      tabId: "dsh-child-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      runtime: "dsh",
      sessionId: "dsh-child",
      sessionView: "subagent-detail",
      subagentParentSessionId: "dsh-parent",
    });

    expect(agentChatStore.getState().sessionsByTabId["dsh-child-tab"]?.error).toBe("DSH attach event is invalid");
  });

  it("rejects a DSH detail whose durable history is not the expected child", async () => {
    mocks.readHistory.mockResolvedValue({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "dsh-child", createdAt: 0, parentSession: "other-parent", origin: "subagent" },
        instanceId: "child-run-1",
        events: [],
        asOfSeq: -1,
        durableThroughSeq: -1,
      },
    });

    await startAgentChatSession({
      tabId: "dsh-child-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      runtime: "dsh",
      sessionId: "dsh-child",
      sessionView: "subagent-detail",
      subagentParentSessionId: "dsh-parent",
    });

    expect(mocks.startAgent).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["dsh-child-tab"]?.error).toBe(
      "DSH read-only transcript is not the expected subagent child",
    );
  });

  it("marks an empty DSH session loaded and idle after ensure", async () => {
    const tabId = "tab-dsh-empty";
    tabStore.setState({
      tabs: [
        {
          id: tabId,
          workspaceId: "workspace-1",
          title: "Agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", runtime: "dsh" },
        },
      ],
    });
    mocks.startAgent.mockImplementation((request) => dshStartResult(request.sessionId));

    await startAgentChatSession({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      runtime: "dsh",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId[tabId]).toMatchObject({
      state: "idle",
      messages: [],
      availableModels: [],
      hydration: expect.objectContaining({ messages: true, models: true, state: true }),
    });
  });

  it("keeps projected DSH messages and running status after ensure", async () => {
    const tabId = "tab-dsh-restored";
    tabStore.setState({
      tabs: [
        {
          id: tabId,
          workspaceId: "workspace-1",
          title: "Agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", runtime: "dsh", sessionId: "dsh-restored" },
        },
      ],
    });
    mocks.startAgent.mockImplementation(async () => {
      agentChatStore.getState().setSessionState(tabId, "running");
      return {
        runtime: "dsh",
        sessionId: "dsh-restored",
        dshAttachSnapshot: {
          runtime: "dsh",
          sessionId: "dsh-restored",
          instanceId: "run-1",
          events: [
            {
              type: "user/message",
              seq: 0,
              time: 0,
              data: {
                id: "projected",
                role: "user",
                content: [{ type: "text", text: "Restored" }],
                source: { kind: "user" },
              },
              surfaceOp: "append",
            },
          ],
          asOfSeq: 0,
          durableThroughSeq: 0,
          headSeq: 0,
        },
      };
    });

    await startAgentChatSession({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "dsh-restored",
      runtime: "dsh",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId[tabId]).toMatchObject({
      state: "running",
      messages: [expect.objectContaining({ id: "projected" })],
      availableModels: [],
      hydration: expect.objectContaining({ messages: true, models: true, state: true }),
    });
  });
  it("maps DSH provider catalog metadata without using Pi provider defaults", async () => {
    tabStore.setState({
      ...initialTabStoreState,
      tabs: [
        {
          id: "dsh-tab",
          workspaceId: "workspace",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", runtime: "dsh", dshSelectedProviderId: "anthropic", dshSelectedModelId: "claude" },
        },
      ],
    });
    agentChatStore.getState().initSession("dsh-tab", "dsh-session");
    mocks.listDSHProviders.mockResolvedValue({
      providers: [
        {
          id: "anthropic",
          displayName: "Anthropic",
          authentication: "api-key",
          credentialRef: "ANTHROPIC_API_KEY",
          configured: true,
          models: [{ id: "claude", name: "Claude" }],
        },
      ],
    });
    mocks.getCapabilities.mockResolvedValue({ dsh: { configured: true, ready: true, transcriptProtocolVersion: 2 } });

    await loadDSHSessionModels("dsh-tab");

    const current = agentChatStore.getState().sessionsByTabId["dsh-tab"]?.currentModel;
    expect(current).toMatchObject({
      id: "claude",
      provider: "anthropic",
      providerName: "Anthropic",
      credentialRef: "ANTHROPIC_API_KEY",
    });
  });
});

describe("loadDSHSessionModels configured providers", () => {
  it("excludes ambient provider models when no credential availability is verified", async () => {
    tabStore.setState({
      ...initialTabStoreState,
      tabs: [
        {
          id: "dsh-tab",
          workspaceId: "workspace",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", runtime: "dsh" },
        },
      ],
    });
    agentChatStore.getState().initSession("dsh-tab", "dsh-session");
    mocks.listDSHProviders.mockResolvedValue({
      providers: [
        {
          id: "configured-provider",
          displayName: "Configured",
          authentication: "api-key",
          credentialRef: "CONFIGURED_API_KEY",
          configured: true,
          models: [{ id: "configured-model", name: "Configured model" }],
        },
        {
          id: "amazon-bedrock",
          displayName: "Amazon Bedrock",
          authentication: "ambient",
          configured: false,
          models: [{ id: "nova", name: "Nova" }],
        },
      ],
    });
    mocks.getCapabilities.mockResolvedValue({ dsh: { configured: true, ready: true, transcriptProtocolVersion: 2 } });

    await loadDSHSessionModels("dsh-tab");

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.availableModels).toEqual([
      expect.objectContaining({ id: "configured-model", provider: "configured-provider" }),
    ]);
  });
});

describe("loadDSHSessionModels selection recovery", () => {
  it("does not replace an unavailable explicit DSH provider and model selection", async () => {
    tabStore.setState({
      ...initialTabStoreState,
      tabs: [
        {
          id: "dsh-tab",
          workspaceId: "workspace",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: {
            cwd: "/workspace",
            runtime: "dsh",
            dshSelectedProviderId: "missing-route",
            dshSelectedModelId: "shared-model",
          },
        },
      ],
    });
    agentChatStore.getState().initSession("dsh-tab", "dsh-session");
    mocks.listDSHProviders.mockResolvedValue({
      providers: [
        {
          id: "available-route",
          displayName: "Available",
          authentication: "api-key",
          configured: true,
          models: [{ id: "shared-model", name: "Shared model" }],
        },
      ],
    });
    mocks.getCapabilities.mockResolvedValue({
      dsh: { configured: true, ready: true, provider: "available-route", model: "shared-model" },
    });

    await loadDSHSessionModels("dsh-tab");

    const session = agentChatStore.getState().sessionsByTabId["dsh-tab"];
    expect(session?.currentModel).toBeNull();
    expect(session?.turnError).toBe("Selected DSH model is unavailable: missing-route/shared-model.");
  });

  it("maps a legacy provider-less DSH selection to the direct DeepSeek route", async () => {
    tabStore.setState({
      ...initialTabStoreState,
      tabs: [
        {
          id: "dsh-tab",
          workspaceId: "workspace",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", runtime: "dsh", dshSelectedModelId: "deepseek-chat" },
        },
      ],
    });
    agentChatStore.getState().initSession("dsh-tab", "dsh-session");
    mocks.listDSHProviders.mockResolvedValue({
      providers: [
        {
          id: "deepseek-official",
          displayName: "DeepSeek",
          authentication: "api-key",
          configured: true,
          models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
        },
      ],
    });
    mocks.getCapabilities.mockResolvedValue({ dsh: { configured: true, ready: true } });

    await loadDSHSessionModels("dsh-tab");

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.currentModel).toMatchObject({
      id: "deepseek-chat",
      provider: "deepseek-official",
    });
  });
});
