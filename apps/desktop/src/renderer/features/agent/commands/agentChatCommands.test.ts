// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../features/workbench/state/splitPaneStore";
import { tabStore } from "../../../features/workbench/state/tabStore";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { agentChatStore } from "../model/agentChatStore";
import { openChatFileTab, renameAgentChatSessionByTab, startAgentChatSession } from "./agentChatCommands";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
}));

vi.mock("../../../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../events/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
  getDaemonClient: vi.fn(async () => ({
    pi: {
      start: mocks.start,
      attach: mocks.attach,
      stop: mocks.stop,
      send: mocks.send,
      listSessions: mocks.listSessions,
      listActiveSessions: mocks.listActiveSessions,
    },
  })),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  // The reopen test leaves a deferred pi.stop implementation behind; reset it so
  // later tests never hang on an unresolved stop.
  mocks.stop.mockReset();
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

vi.mock("@renderer/features/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/features/workbench")>();
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
    mocks.start.mockResolvedValue({ sessionId: "session-1" });

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
    mocks.start.mockRejectedValueOnce({
      code: -32003,
      message: "agent session already exists",
    });
    mocks.attach.mockResolvedValue({ ok: true });

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
    const rename = vi.fn(async () => ({ ok: true }));
    vi.mocked(getDaemonClient).mockResolvedValueOnce({
      pi: {
        start: mocks.start,
        attach: mocks.attach,
        stop: mocks.stop,
        send: mocks.send,
        listSessions: mocks.listSessions,
        listActiveSessions: mocks.listActiveSessions,
        rename,
      },
    } as never);
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

    expect(rename).toHaveBeenCalledWith({ sessionId: "sess-123", title: "New Chat Name" });
  });

  it("does nothing for non-agent-chat tabs", async () => {
    const rename = vi.fn(async () => ({ ok: true }));
    vi.mocked(getDaemonClient).mockResolvedValueOnce({
      pi: {
        start: mocks.start,
        attach: mocks.attach,
        stop: mocks.stop,
        send: mocks.send,
        listSessions: mocks.listSessions,
        listActiveSessions: mocks.listActiveSessions,
        rename,
      },
    } as never);
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

    expect(rename).not.toHaveBeenCalled();
  });

  it("does nothing when the agent-chat tab has no session id", async () => {
    const rename = vi.fn(async () => ({ ok: true }));
    vi.mocked(getDaemonClient).mockResolvedValueOnce({
      pi: {
        start: mocks.start,
        attach: mocks.attach,
        stop: mocks.stop,
        send: mocks.send,
        listSessions: mocks.listSessions,
        listActiveSessions: mocks.listActiveSessions,
        rename,
      },
    } as never);
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

    expect(rename).not.toHaveBeenCalled();
  });
});
