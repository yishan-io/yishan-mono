import { tabStore } from "@renderer/domains/workbench";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAgentChatSession } from "../commands/agentChatCommands";
import { agentChatStore } from "../state/agentChatStore";
import { applySubagentLiveTranscripts } from "./agentChatSubagentEvents";

const rpc = vi.hoisted(() => ({ start: vi.fn(), send: vi.fn() }));
vi.mock("../daemon/daemonAgentProcedures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../daemon/daemonAgentProcedures")>()),
  startPiSession: rpc.start,
  sendPiCommand: rpc.send,
}));
vi.mock("./agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

const initialTabs = tabStore.getState();
const store = () => agentChatStore.getState();
function seedDetail(id: string, parentSessionId?: string) {
  tabStore.setState({
    tabs: [
      ...tabStore.getState().tabs,
      {
        id,
        workspaceId: "workspace",
        title: id,
        pinned: false,
        kind: "agent-chat",
        data: {
          cwd: "/tmp",
          sessionId: "child",
          sessionView: "subagent-detail",
          subagentParentSessionId: parentSessionId,
        },
      },
    ],
  });
  store().initSession(id, "child");
}
beforeEach(() => {
  vi.clearAllMocks();
  rpc.start.mockResolvedValue({ sessionId: "child" });
  rpc.send.mockResolvedValue({ ok: true });
  agentChatStore.setState({ sessionsByTabId: {} });
  tabStore.setState({
    tabs: [
      {
        id: "parent",
        workspaceId: "workspace",
        title: "Parent",
        pinned: false,
        kind: "agent-chat",
        data: { cwd: "/tmp", sessionId: "parent-session" },
      },
    ],
  });
  store().initSession("parent", "parent-session");
});
afterEach(() => {
  tabStore.setState(initialTabs, true);
});

describe("live detail integration (slice B)", () => {
  it("seeds a command-opened running child after the parent end boundary", async () => {
    store().setSubagentSessionEndedAt("parent", 100);
    store().appendMessage("parent", {
      id: "new-child-run",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      timestamp: 200,
      details: { event: "started", childSessionId: "child", agentId: "agent-child", agentName: "reader" },
    });
    applySubagentLiveTranscripts("parent", [
      { childSessionId: "child", messages: [{ id: "new", role: "assistant", content: "new body" }] },
    ]);
    const snapshot = store().sessionsByTabId.parent?.subagentSnapshots.child;
    expect(snapshot?.activity).toBe("running");
    await startAgentChatSession({
      tabId: "seeded",
      workspaceId: "workspace",
      cwd: "/tmp",
      sessionId: "child",
      sessionView: "subagent-detail",
      subagentParentSessionId: "parent-session",
    });
    const seeded = store().sessionsByTabId.seeded;
    expect(seeded?.messages).toBe(snapshot?.messages);
    expect(seeded?.transcript).toBe(snapshot?.transcript);
    expect(seeded).toMatchObject({
      subagentSnapshotBinding: { parentSessionId: "parent-session", childSessionId: "child" },
      hasLoadedMessages: true,
      state: "running",
      isTurnActive: true,
    });
  });

  it("updates all valid targets atomically from retained cache, preserves parser coverage and seeds commands", async () => {
    seedDetail("detail", "parent-session");
    seedDetail("legacy");
    seedDetail("foreign", "someone-else");
    const observed: boolean[] = [];
    const unsubscribe = agentChatStore.subscribe((state) => {
      if (state.sessionsByTabId.parent?.subagentSnapshots.child)
        observed.push(
          state.sessionsByTabId.detail?.transcript === state.sessionsByTabId.parent.subagentSnapshots.child.transcript,
        );
    });
    applySubagentLiveTranscripts("parent", [
      {
        childSessionId: "child",
        status: "running",
        thinkingLevel: "high",
        model: { id: "model", name: "Model" },
        coverage: { completeness: "partial", omittedMessages: 7, reasons: ["messageLimit"] },
        messages: Array.from({ length: 101 }, (_, i) => ({ id: `m${i}`, role: "assistant", content: `body${i}` })),
      },
    ]);
    unsubscribe();
    expect(observed).toEqual([true]);
    const parent = store().sessionsByTabId.parent;
    if (!parent) throw new Error("Expected parent session");
    for (const id of ["detail", "legacy"]) {
      expect(store().sessionsByTabId[id]?.messages).toBe(parent.subagentSnapshots.child?.messages);
      expect(store().sessionsByTabId[id]?.subagentSnapshotCoverage?.omittedMessages).toBe(8);
    }
    expect(store().sessionsByTabId.foreign?.hasLoadedMessages).toBe(false);
    await startAgentChatSession({
      tabId: "seeded",
      workspaceId: "workspace",
      cwd: "/tmp",
      sessionId: "child",
      sessionView: "subagent-detail",
      subagentParentSessionId: "parent-session",
    });
    expect(store().sessionsByTabId.seeded?.transcript).toBe(parent.subagentSnapshots.child?.transcript);
    expect(store().sessionsByTabId.seeded?.thinkingLevel).toBe("high");
    applySubagentLiveTranscripts("parent", [{ childSessionId: "child", messages: [] }]);
    expect(store().sessionsByTabId.detail?.thinkingLevel).toBe("high");
    expect(store().sessionsByTabId.detail?.currentModel?.id).toBe("model");
  });

  it("does not bypass the child budget or apply data without an actual parent", () => {
    seedDetail("detail");
    applySubagentLiveTranscripts("missing", [
      { childSessionId: "child", messages: [{ id: "bad", role: "assistant", content: "bad" }] },
    ]);
    expect(store().sessionsByTabId.detail?.hasLoadedMessages).toBe(false);
    applySubagentLiveTranscripts(
      "parent",
      Array.from({ length: 21 }, (_, i) => ({
        childSessionId: i === 0 ? "child" : `child${i}`,
        messages: [{ id: "m", role: "assistant", content: "body" }],
      })),
    );
    expect(store().sessionsByTabId.parent?.subagentSnapshots.child).toBeUndefined();
    expect(store().sessionsByTabId.detail?.hasLoadedMessages).toBe(false);
  });
});

describe("final cache-only reopen regressions", () => {
  it.each(["endedAt", "error"])("uses normal history RPC after %s without inventing completion", async (boundary) => {
    applySubagentLiveTranscripts("parent", [
      {
        childSessionId: "child",
        status: "running",
        messages: [{ id: "cached", role: "assistant", content: "partial" }],
      },
    ]);
    if (boundary === "endedAt") store().setSubagentSessionEndedAt("parent", 100);
    else store().setSessionError("parent", "disconnected");
    expect(store().sessionsByTabId.parent?.transcript.childRuns?.get("child")).toBeUndefined();
    expect(store().sessionsByTabId.parent?.finishedSubagents).toEqual([]);
    await startAgentChatSession({
      tabId: `reopen-${boundary}`,
      workspaceId: "workspace",
      cwd: "/tmp",
      sessionId: "child",
      sessionView: "subagent-detail",
      subagentParentSessionId: "parent-session",
    });
    expect(rpc.start).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "child" }));
    for (const type of ["get_state", "get_messages", "get_available_models", "get_session_stats"]) {
      expect(rpc.send).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "child",
          command: expect.objectContaining({ type }),
        }),
      );
    }
    expect(store().sessionsByTabId[`reopen-${boundary}`]?.pendingHistoryRequest).not.toBeNull();
  });
});
