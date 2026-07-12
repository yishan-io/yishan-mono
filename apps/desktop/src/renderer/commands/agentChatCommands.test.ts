// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import { ensurePiSession } from "./agentChatCommands";

const initialAgentChatStoreState = agentChatStore.getState();

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    pi: {
      start: mocks.start,
      stop: mocks.stop,
      send: mocks.send,
      listSessions: mocks.listSessions,
    },
  })),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

describe("agentChatCommands.ensurePiSession", () => {
  it("passes paneId through to pi.start", async () => {
    mocks.start.mockResolvedValue({ sessionId: "pi-session-1" });

    await ensurePiSession({
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      piSessionId: "pi-session-1",
      paneId: "pane-1",
    });

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "pi-session-1",
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      piSessionId: "pi-session-1",
      paneId: "pane-1",
    });
  });

  it("uses a deterministic pane fallback when paneId is omitted", async () => {
    mocks.start.mockResolvedValue({ sessionId: "pi-session-2" });

    await ensurePiSession({
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
      piSessionId: "pi-session-2",
    });

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "pi-session-2",
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
      piSessionId: "pi-session-2",
      paneId: "pane-tab-pane-fallback",
    });
  });
});
