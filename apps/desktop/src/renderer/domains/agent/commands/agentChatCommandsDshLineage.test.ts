// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { dshStartResult } from "../runtime/agentSessionRuntime.dsh.testSupport";
import { agentChatStore } from "../state/agentChatStore";
import {
  recoverAgentSessionAfterReconnect,
  refreshDshSubagentLineage,
  startAgentChatSession,
} from "./agentChatCommands";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

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
  recoverRuntime: vi.fn(),
}));

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../runtime/agentSessionRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../runtime/agentSessionRuntime")>();
  return { ...actual, recoverAgentSessionAfterReconnect: mocks.recoverRuntime };
});

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
function setDshParentTab(tabId: string, sessionId: string, runtime: "pi" | "dsh" = "dsh"): void {
  tabStore.setState({
    ...tabStore.getState(),
    tabs: [
      {
        id: tabId,
        workspaceId: "workspace-1",
        title: "Agent",
        pinned: false,
        kind: "agent-chat",
        data: { cwd: "/tmp/project", sessionId, runtime },
      },
    ],
  });
}

function createLineage(parentSessionId: string, childSessionId: string, label: string) {
  return {
    runtime: "dsh" as const,
    rootSessionId: parentSessionId,
    mode: "children" as const,
    children: [
      {
        sessionId: childSessionId,
        parentSessionId,
        origin: "subagent" as const,
        delegationDepth: 1,
        relativeDepth: 1,
        live: true,
        persisted: true,
        activity: "running" as const,
        label,
      },
    ],
  };
}

describe("agentChatCommands DSH lineage", () => {
  it("refreshes the exact DSH direct-child lineage request and replaces the snapshot", async () => {
    agentChatStore.getState().initSession("tab-dsh-lineage", "parent-session");
    setDshParentTab("tab-dsh-lineage", "parent-session");
    mocks.listSessionLineage.mockResolvedValue({
      runtime: "dsh",
      rootSessionId: "parent-session",
      mode: "children",
      children: [
        {
          sessionId: "child-session",
          parentSessionId: "parent-session",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: true,
          persisted: true,
          activity: "running",
          label: "Research",
        },
      ],
    });

    await refreshDshSubagentLineage({
      tabId: "tab-dsh-lineage",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "parent-session",
    });

    expect(mocks.listSessionLineage).toHaveBeenCalledWith({
      runtime: "dsh",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "parent-session",
      mode: "children",
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-dsh-lineage"]?.dshRunningSubagents).toEqual([
      expect.objectContaining({ rowId: "dsh:child-session", runtime: "dsh" }),
    ]);
  });

  it("retains the prior DSH lineage snapshot when refresh fails", async () => {
    agentChatStore.getState().initSession("tab-dsh-lineage-failure", "parent-session");
    setDshParentTab("tab-dsh-lineage-failure", "parent-session");
    agentChatStore.getState().setDshRunningSubagents("tab-dsh-lineage-failure", [
      {
        rowId: "dsh:existing-child",
        runtime: "dsh",
        agentName: "Existing",
        childSessionId: "existing-child",
        title: "Existing",
        promptSummary: "Existing",
        state: "running",
      },
    ]);
    mocks.listSessionLineage.mockRejectedValue(new Error("lineage unavailable"));

    await refreshDshSubagentLineage({
      tabId: "tab-dsh-lineage-failure",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "parent-session",
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-dsh-lineage-failure"]?.dshRunningSubagents).toHaveLength(1);
  });

  it("keeps the newest DSH lineage snapshot when overlapping refreshes complete out of order", async () => {
    const tabId = "tab-overlapping-lineage";
    agentChatStore.getState().initSession(tabId, "parent-session");
    setDshParentTab(tabId, "parent-session");
    let resolveFirst!: (lineage: ReturnType<typeof createLineage>) => void;
    let resolveSecond!: (lineage: ReturnType<typeof createLineage>) => void;
    mocks.listSessionLineage
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const firstRefresh = refreshDshSubagentLineage({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "parent-session",
    });
    const secondRefresh = refreshDshSubagentLineage({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "parent-session",
    });
    resolveSecond(createLineage("parent-session", "new-child", "New child"));
    await secondRefresh;
    resolveFirst(createLineage("parent-session", "old-child", "Old child"));
    await firstRefresh;

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.dshRunningSubagents).toEqual([
      expect.objectContaining({ childSessionId: "new-child" }),
    ]);
  });

  it("does not apply lineage when the tab is rebound while its refresh is pending", async () => {
    const tabId = "tab-rebound-lineage";
    agentChatStore.getState().initSession(tabId, "old-parent");
    setDshParentTab(tabId, "old-parent");
    let resolveLineage!: (lineage: ReturnType<typeof createLineage>) => void;
    mocks.listSessionLineage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLineage = resolve;
        }),
    );

    const refresh = refreshDshSubagentLineage({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "old-parent",
    });
    agentChatStore.getState().initSession(tabId, "new-parent");
    setDshParentTab(tabId, "new-parent", "pi");
    resolveLineage(createLineage("old-parent", "old-child", "Old child"));
    await refresh;

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.dshRunningSubagents).toEqual([]);
  });

  it("uses the protected lineage refresh after DSH reconnect recovery", async () => {
    const tabId = "tab-dsh-reconnect-lineage";
    agentChatStore.getState().initSession(tabId, "dsh-parent");
    setDshParentTab(tabId, "dsh-parent");
    mocks.recoverRuntime.mockResolvedValue(undefined);
    mocks.listSessionLineage.mockResolvedValue(createLineage("dsh-parent", "reconnected-child", "Reconnected child"));

    await recoverAgentSessionAfterReconnect({
      tabId,
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      runtime: "dsh",
      sessionId: "dsh-parent",
      sessionView: "full",
    });
    await vi.waitFor(() => expect(mocks.listSessionLineage).toHaveBeenCalledTimes(1));

    expect(mocks.listSessionLineage).toHaveBeenCalledWith({
      runtime: "dsh",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      rootSessionId: "dsh-parent",
      mode: "children",
    });
  });

  it("refreshes lineage only for usable DSH parent tabs", async () => {
    const lineage = {
      runtime: "dsh" as const,
      rootSessionId: "dsh-parent",
      mode: "children" as const,
      children: [],
    };
    setDshParentTab("tab-dsh-parent", "dsh-parent");
    mocks.startAgent.mockResolvedValue(dshStartResult("dsh-parent"));
    mocks.listSessionLineage.mockResolvedValue(lineage);

    await startAgentChatSession({
      tabId: "tab-dsh-parent",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      runtime: "dsh",
      sessionId: "dsh-parent",
      sessionView: "full",
    });
    await vi.waitFor(() => expect(mocks.listSessionLineage).toHaveBeenCalledTimes(1));

    vi.clearAllMocks();
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "pi-parent" });
    await startAgentChatSession({
      tabId: "tab-pi-parent",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      runtime: "pi",
      sessionView: "full",
    });
    await startAgentChatSession({
      tabId: "tab-dsh-detail",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      runtime: "dsh",
      sessionId: "dsh-child",
      sessionView: "subagent-detail",
    });
    await Promise.resolve();
    expect(mocks.listSessionLineage).not.toHaveBeenCalled();
  });
});
