// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { renamePiCompatibilitySession } from "../../../domains/agent/daemon/daemonAgentProcedures";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { agentChatStore } from "../state/agentChatStore";
import { openChatFileTab, renameAgentChatSessionByTab, startAgentChatSession } from "./agentChatCommands";

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
  attachAgentSession: mocks.attachAgent,
  abortAgentSession: mocks.abortAgent,
  disposeAgentSession: mocks.disposeAgent,
  promptAgentSession: mocks.promptAgent,
  startAgentSession: mocks.startAgent,
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
