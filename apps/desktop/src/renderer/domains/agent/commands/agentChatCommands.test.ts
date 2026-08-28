// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { renamePiCompatibilitySession } from "../../../domains/agent/daemon/daemonAgentProcedures";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { agentChatStore } from "../state/agentChatStore";
import {
  loadDSHSessionModels,
  openChatFileTab,
  renameAgentChatSessionByTab,
  startAgentChatSession,
} from "./agentChatCommands";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(),
  attachAgent: vi.fn(),
  promptAgent: vi.fn(),
  abortAgent: vi.fn(),
  disposeAgent: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
  getSessionFile: vi.fn(),
  listModels: vi.fn(),
  listDSHProviders: vi.fn(),
  listProviders: vi.fn(),
  removeProvider: vi.fn(),
  rename: vi.fn(),
  runChatPrompt: vi.fn(),
  saveProvider: vi.fn(),
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  getDetectionStatuses: vi.fn(),
  listDetectionStatuses: vi.fn(),
  getCapabilities: vi.fn(),
  listSessionLineage: vi.fn(),
}));

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  attachAgentSession: mocks.attachAgent,
  abortAgentSession: mocks.abortAgent,
  disposeAgentSession: mocks.disposeAgent,
  getAgentCapabilities: mocks.getCapabilities,
  promptAgentSession: mocks.promptAgent,
  startAgentSession: mocks.startAgent,
  closeAgentSession: mocks.closeAgentSession ?? vi.fn(),
  ensureWorkspaceChatSession: mocks.ensureChatSession ?? vi.fn(),
  listActivePiCompatibilitySessions: mocks.listActiveSessions ?? vi.fn(),
  listAgentDetectionStatuses: mocks.listDetectionStatuses ?? vi.fn(),
  listAgentSessionLineage: mocks.listSessionLineage,
  listAgentModels: mocks.listModels ?? vi.fn(),
  listDSHProviders: mocks.listDSHProviders ?? vi.fn(),
  listPiProviders: mocks.listProviders ?? vi.fn(),
  removePiProvider: mocks.removeProvider ?? vi.fn(),
  renamePiCompatibilitySession: mocks.rename ?? vi.fn(),
  runWorkspaceChatPrompt: mocks.runChatPrompt ?? vi.fn(),
  savePiProvider: mocks.saveProvider ?? vi.fn(),
  sendPiCompatibilityCommand: mocks.send ?? vi.fn(),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
});

const openChatMocks = vi.hoisted(() => ({
  resolveChatFilePath: vi.fn(),
  openTab: vi.fn(),
  openTabInOppositePane: vi.fn(),
}));

vi.mock("../../files/commands/fileCommands", () => ({
  resolveChatFilePath: openChatMocks.resolveChatFilePath,
}));

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
  return {
    ...actual,
    openTab: openChatMocks.openTab,
    openTabInOppositePane: openChatMocks.openTabInOppositePane,
  };
});

vi.mock("../../workspace/state/workspaceActions", () => ({
  enqueueWorkspaceErrorNotice: vi.fn(),
}));
describe("agentChatCommands.startAgentChatSession", () => {
  it.each([
    [{ configured: false, ready: true }, "pi"],
    [{ configured: true, ready: false }, "pi"],
    [{ configured: true, ready: true }, "dsh"],
  ] as const)("selects %s for a brand-new top-level tab", async (dsh, runtime) => {
    mocks.getCapabilities.mockResolvedValue({ dsh });
    const tabId = `tab-choice-${runtime}-${dsh.ready}`;
    tabStore.setState({
      tabs: [
        {
          id: tabId,
          workspaceId: "workspace-1",
          title: "Agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project" },
        },
      ],
    });
    mocks.startAgent.mockImplementation(async () => {
      const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId);
      expect(tab?.kind === "agent-chat" ? tab.data.runtime : undefined).toBe(runtime);
      return { runtime, sessionId: "selected-session" };
    });

    await startAgentChatSession({ tabId, workspaceId: "workspace-1", cwd: "/tmp/project", sessionView: "full" });

    expect(mocks.startAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime }));
    expect(tabStore.getState().tabs[0]).toMatchObject({ data: { runtime } });
    if (runtime === "dsh") expect(mocks.send).not.toHaveBeenCalled();
  });

  it("retains DSH after a start failure so retry does not reselect Pi", async () => {
    const tabId = "tab-dsh-retry";
    tabStore.setState({
      tabs: [
        {
          id: tabId,
          workspaceId: "workspace-1",
          title: "Agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project" },
        },
      ],
    });
    mocks.getCapabilities.mockResolvedValueOnce({ dsh: { configured: true, ready: true } });
    mocks.startAgent.mockRejectedValueOnce(new Error("DSH unavailable")).mockResolvedValueOnce({ runtime: "dsh" });

    await startAgentChatSession({ tabId, workspaceId: "workspace-1", cwd: "/tmp/project", sessionView: "full" });

    const persistedTab = tabStore.getState().tabs.find((tab) => tab.id === tabId);
    const persistedRuntime = persistedTab?.kind === "agent-chat" ? persistedTab.data.runtime : undefined;
    expect(persistedRuntime).toBe("dsh");

    await startAgentChatSession({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      runtime: persistedRuntime,
      sessionView: "full",
    });

    expect(mocks.startAgent).toHaveBeenNthCalledWith(2, expect.objectContaining({ runtime: "dsh" }));
    // getCapabilities is called once for runtime selection on the first attempt,
    // and once for DSH model loading on the second (successful) attempt.
    expect(mocks.getCapabilities).toHaveBeenCalledTimes(2);
  });

  it("preserves a requested restored session ID when start initialization fails", async () => {
    mocks.startAgent.mockRejectedValueOnce(new Error("DSH unavailable"));

    await startAgentChatSession({
      tabId: "tab-restored-error",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "restored-dsh-session",
      runtime: "dsh",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-restored-error"]).toMatchObject({
      sessionId: "restored-dsh-session",
      state: "error",
    });
  });

  it("starts restored DSH history through agent.start with resume without changing Pi", async () => {
    mocks.startAgent.mockResolvedValue({ ok: true });
    await startAgentChatSession({
      tabId: "tab-pi",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "same-id",
      runtime: "pi",
      sessionView: "full",
    });
    await startAgentChatSession({
      tabId: "tab-dsh",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "same-id",
      runtime: "dsh",
      sessionView: "full",
    });

    expect(mocks.startAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ runtime: "pi", sessionId: "same-id" }),
    );
    expect(mocks.startAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ runtime: "dsh", sessionId: "same-id", resume: true }),
    );
    const piStartRequest = mocks.startAgent.mock.calls[0]?.[0];
    if (!piStartRequest) throw new Error("missing Pi start request");
    expect(piStartRequest).not.toHaveProperty("resume");
  });

  it("classifies pre-existing history as interrupted after a fresh start", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "session-1" });

    await startAgentChatSession({
      tabId: "tab-fresh",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-1",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-fresh"]?.subagentSessionEndedAtMs).not.toBeNull();
  });

  it("keeps rows live after an attach to a still-alive process", async () => {
    mocks.startAgent.mockRejectedValueOnce({
      code: -32003,
      message: "agent session already exists",
    });
    mocks.attachAgent.mockResolvedValue({ runtime: "pi", ok: true });

    await startAgentChatSession({
      tabId: "tab-attach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-1",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-attach"]?.subagentSessionEndedAtMs).toBeNull();
  });

  it("openChatFileTab opens the resolved file in the resolved workspace", async () => {
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({
      status: "found",
      path: "src/db/index.ts",
      content: "db content",
    });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(openChatMocks.openTab).toHaveBeenCalledWith({
      kind: "file",
      workspaceId: "workspace-1",
      path: "src/db/index.ts",
      content: "db content",
    });
    expect(openChatMocks.openTabInOppositePane).not.toHaveBeenCalled();
  });

  it("openChatFileTab opens in the opposite pane when requested", async () => {
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({
      status: "found",
      path: "src/a.ts",
      content: "a",
    });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "a.ts", oppositePane: true });

    expect(openChatMocks.openTabInOppositePane).toHaveBeenCalledWith({
      kind: "file",
      workspaceId: "workspace-1",
      path: "src/a.ts",
      content: "a",
    });
  });

  it("openChatFileTab notifies when the referenced file does not exist", async () => {
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({ status: "not-found" });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(openChatMocks.openTab).not.toHaveBeenCalled();
  });

  it("openChatFileTab notifies separately when the file could not be loaded", async () => {
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({ status: "unavailable" });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(openChatMocks.openTab).not.toHaveBeenCalled();
  });
});

describe("renameAgentChatSessionByTab", () => {
  it("renames the pi session that backs an agent-chat tab", async () => {
    vi.mocked(renamePiCompatibilitySession).mockResolvedValue({ ok: true });
    tabStore.setState({
      tabs: [
        {
          id: "tab-chat",
          workspaceId: "ws-1",
          title: "Old Chat",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp", sessionId: "sess-123" },
        },
      ],
    });

    await renameAgentChatSessionByTab("tab-chat", "New Chat Name");

    expect(renamePiCompatibilitySession).toHaveBeenCalledWith({ sessionId: "sess-123", title: "New Chat Name" });
  });

  it("does not rename an equal-ID Pi session from a DSH tab", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-dsh",
          workspaceId: "ws-1",
          title: "DSH Chat",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp", sessionId: "shared-id", runtime: "dsh" },
        },
      ],
    });

    await renameAgentChatSessionByTab("tab-dsh", "New DSH Name");

    expect(renamePiCompatibilitySession).not.toHaveBeenCalled();
  });

  it("does nothing for non-agent-chat tabs", async () => {
    vi.mocked(renamePiCompatibilitySession).mockResolvedValue({ ok: true });
    tabStore.setState({
      tabs: [
        {
          id: "tab-term",
          workspaceId: "ws-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", sessionId: "sess-456" },
        },
      ],
    });

    await renameAgentChatSessionByTab("tab-term", "New Terminal");

    expect(renamePiCompatibilitySession).not.toHaveBeenCalled();
  });

  it("does nothing when the agent-chat tab has no session id", async () => {
    vi.mocked(renamePiCompatibilitySession).mockResolvedValue({ ok: true });
    tabStore.setState({
      tabs: [
        {
          id: "tab-chat",
          workspaceId: "ws-1",
          title: "No Session",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp" },
        },
      ],
    });

    await renameAgentChatSessionByTab("tab-chat", "New Name");

    expect(renamePiCompatibilitySession).not.toHaveBeenCalled();
  });
});

describe("agentChatCommands.startAgentChatSession DSH hydration", () => {
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
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-empty" });

    await startAgentChatSession({ tabId, workspaceId: "workspace-1", cwd: "/tmp/project", sessionView: "full" });

    expect(agentChatStore.getState().sessionsByTabId[tabId]).toMatchObject({
      state: "idle",
      messages: [],
      availableModels: [],
      hasLoadedModels: true,
      hasLoadedState: true,
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
      agentChatStore
        .getState()
        .replaceMessages(tabId, [
          { id: "projected", role: "assistant", content: [{ type: "text", text: "Restored" }], timestamp: 0 },
        ]);
      agentChatStore.getState().setSessionState(tabId, "running");
      return { runtime: "dsh", sessionId: "dsh-restored" };
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
      hasLoadedModels: true,
      hasLoadedState: true,
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
  it("excludes unconfigured provider models from the DSH model picker", async () => {
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
          id: "unconfigured-provider",
          displayName: "Unconfigured",
          authentication: "api-key",
          credentialRef: "UNCONFIGURED_API_KEY",
          configured: false,
          models: [{ id: "unconfigured-model", name: "Unconfigured model" }],
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
