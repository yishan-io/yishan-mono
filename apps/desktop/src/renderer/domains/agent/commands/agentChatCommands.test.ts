// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { renamePiCompatibilitySession } from "../../../domains/agent/daemon/daemonAgentProcedures";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { dshStartResult } from "../runtime/agentSessionRuntime.dsh.testSupport";
import { agentChatStore } from "../state/agentChatStore";
import { loadDSHSessionModels, openChatFileTab, renameAgentChatSessionByTab, startAgentChatSession } from "./agentChatCommands";

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
    mocks.startAgent.mockImplementation(async (request) => {
      const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId);
      expect(tab?.kind === "agent-chat" ? tab.data.runtime : undefined).toBe(runtime);
      return runtime === "dsh" ? dshStartResult(request.sessionId) : { runtime, sessionId: "selected-session" };
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
    mocks.startAgent
      .mockRejectedValueOnce(new Error("DSH unavailable"))
      .mockResolvedValueOnce(dshStartResult("generated-session-id"));

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
    mocks.startAgent
      .mockResolvedValueOnce({ runtime: "pi", sessionId: "same-id" })
      .mockResolvedValueOnce(dshStartResult("same-id"));
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

  it("does not rehydrate an already loaded session when its UI remounts", async () => {
    mocks.startAgent.mockResolvedValue({ sessionId: "session-loaded" });
    const options = {
      tabId: "tab-loaded",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-loaded",
      sessionView: "full" as const,
    };

    await startAgentChatSession(options);
    for (const type of ["get_state", "get_messages", "get_available_models"]) {
      expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ type }) }));
    }
    agentChatStore.getState().replaceMessages("tab-loaded", []);
    agentChatStore.getState().setAvailableModels("tab-loaded", []);
    agentChatStore.getState().markStateLoaded("tab-loaded");
    mocks.send.mockClear();

    await startAgentChatSession(options);

    expect(mocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ type: "get_messages" }) }),
    );
    expect(mocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ type: "get_state" }) }),
    );
    expect(mocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ type: "get_available_models" }) }),
    );
    expect(mocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ type: "get_session_stats" }) }),
    );
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

    expect(tabStore.getState().tabs).toContainEqual({
      id: expect.any(String),
      kind: "file",
      workspaceId: "workspace-1",
      title: "index.ts",
      pinned: false,
      data: { path: "src/db/index.ts", isDirty: false, isTemporary: false },
    });
  });

  it("openChatFileTab opens in the opposite pane when requested", async () => {
    splitPaneStore.getState().registerTabInPane("workspace-1", "existing-tab");
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({
      status: "found",
      path: "src/a.ts",
      content: "a",
    });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "a.ts", oppositePane: true });

    expect(tabStore.getState().tabs).toContainEqual({
      id: expect.any(String),
      kind: "file",
      workspaceId: "workspace-1",
      title: "a.ts",
      pinned: false,
      data: { path: "src/a.ts", isDirty: false, isTemporary: false },
    });
    expect(splitPaneStore.getState().getAllPanes("workspace-1")).toHaveLength(2);
  });

  it("openChatFileTab notifies when the referenced file does not exist", async () => {
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({ status: "not-found" });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(tabStore.getState().tabs).toHaveLength(0);
  });

  it("openChatFileTab notifies separately when the file could not be loaded", async () => {
    openChatMocks.resolveChatFilePath.mockResolvedValueOnce({ status: "unavailable" });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(tabStore.getState().tabs).toHaveLength(0);
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
