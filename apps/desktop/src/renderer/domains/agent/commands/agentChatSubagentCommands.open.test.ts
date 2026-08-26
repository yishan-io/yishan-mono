// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { openSubagentSessionInRightSplitPane } from "../commands/agentChatSubagentCommands";
import { agentChatStore } from "../state/agentChatStore";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(),
  promptAgent: vi.fn(),
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
  startAgentSession: mocks.startAgent,
  promptAgentSession: mocks.promptAgent,
  closeAgentSession: mocks.closeAgentSession ?? vi.fn(),
  ensureWorkspaceChatSession: mocks.ensureChatSession ?? vi.fn(),
  listActivePiCompatibilitySessions: mocks.listActiveSessions ?? vi.fn(),
  listAgentDetectionStatuses: mocks.listDetectionStatuses ?? vi.fn(),
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
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
});
describe("agentChatSubagentCommands open subagent sessions", () => {
  it("opens a child session in a new right split pane beside the parent tab", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "sibling-tab",
            workspaceId: "workspace-1",
            title: "Sibling Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "sibling-session" },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");
    splitPaneStore.getState().registerTabInPane("workspace-1", "sibling-tab", "root-pane");
    splitPaneStore.getState().selectTab("workspace-1", "root-pane", "parent-tab");

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      parentSessionId: "parent-session",
      agentId: "agent-1",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const childTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "child-session-1");
    expect(childTab).toBeTruthy();
    expect(childTab?.kind === "agent-chat" ? childTab.data.sessionView : undefined).toBe("subagent-detail");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentAgentId : undefined).toBe("agent-1");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentParentSessionId : undefined).toBe("parent-session");
    expect(tabStore.getState().selectedTabId).toBe(childTab?.id);

    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const childPane = panes.find((pane) => childTab && pane.tabIds.includes(childTab.id));
    expect(panes).toHaveLength(2);
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab", "sibling-tab"], selectedTabId: "parent-tab" });
    expect(childPane).toMatchObject({ selectedTabId: childTab?.id });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(childPane?.id);
  });

  it("does not reuse a same-ID tab from another runtime", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "pi-child-tab",
            workspaceId: "workspace-1",
            title: "Pi child",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "same-child", runtime: "pi" },
          },
        ],
      },
      true,
    );

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      childSessionId: "same-child",
      runtime: "dsh",
      title: "DSH child",
    });

    expect(tabStore.getState().tabs).toMatchObject([
      { id: "pi-child-tab", data: { sessionId: "same-child", runtime: "pi" } },
      { kind: "agent-chat", data: { sessionId: "same-child", runtime: "dsh" } },
    ]);
  });

  it("reuses an existing opposite pane for a new child session", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "opposite-tab",
            workspaceId: "workspace-1",
            title: "Opposite Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "opposite-session" },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: {
            kind: "branch",
            id: "branch-root",
            direction: "horizontal",
            ratio: 0.5,
            first: { kind: "leaf", id: "root-pane", tabIds: ["parent-tab"], selectedTabId: "parent-tab" },
            second: { kind: "leaf", id: "opposite-pane", tabIds: ["opposite-tab"], selectedTabId: "opposite-tab" },
          },
          activePaneId: "root-pane",
        },
      },
    });

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      parentSessionId: "parent-session",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const childTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "child-session-1");
    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const oppositePane = panes.find((pane) => pane.id !== "root-pane");
    expect(panes).toHaveLength(2);
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab"], selectedTabId: "parent-tab" });
    expect(oppositePane).toMatchObject({ tabIds: ["opposite-tab", childTab?.id], selectedTabId: childTab?.id });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(oppositePane?.id);
  });

  it("reveals an existing child session by splitting it into the right pane when the tab is not in any pane", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "sibling-tab",
            workspaceId: "workspace-1",
            title: "Sibling Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "sibling-session" },
          },
          {
            id: "child-tab",
            workspaceId: "workspace-1",
            title: "Builder — implement row",
            pinned: false,
            kind: "agent-chat",
            data: {
              cwd: "/tmp/project",
              sessionId: "child-session-1",
              sessionView: "subagent-detail",
              subagentAgentId: "stale-agent",
            },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");
    splitPaneStore.getState().registerTabInPane("workspace-1", "sibling-tab", "root-pane");
    splitPaneStore.getState().selectTab("workspace-1", "root-pane", "parent-tab");

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      parentSessionId: "parent-session",
      agentId: "agent-1",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    expect(tabStore.getState().selectedTabId).toBe("child-tab");
    const childTab = tabStore.getState().tabs.find((tab) => tab.id === "child-tab" && tab.kind === "agent-chat");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentAgentId : undefined).toBe("agent-1");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentParentSessionId : undefined).toBe("parent-session");
    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const childPane = panes.find((pane) => pane.tabIds.includes("child-tab"));
    expect(panes).toHaveLength(2);
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab", "sibling-tab"], selectedTabId: "parent-tab" });
    expect(childPane).toMatchObject({ selectedTabId: "child-tab" });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(childPane?.id);
  });

  it("moves an existing child from the parent pane into a right split", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "child-tab",
            workspaceId: "workspace-1",
            title: "Builder — implement row",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "child-session-1", sessionView: "subagent-detail" },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");
    splitPaneStore.getState().registerTabInPane("workspace-1", "child-tab", "root-pane");
    splitPaneStore.getState().selectTab("workspace-1", "root-pane", "parent-tab");

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const childPane = panes.find((pane) => pane.tabIds.includes("child-tab"));
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab"], selectedTabId: "parent-tab" });
    expect(childPane).toMatchObject({ selectedTabId: "child-tab" });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(childPane?.id);
  });
});
