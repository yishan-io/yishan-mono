import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AgentDSHHistory } from "./daemonAgentTypes";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@renderer/rpc", () => ({ request: mocks.request }));

import {
  abortAgentSession,
  attachAgentSession,
  disposeAgentSession,
  getAgentCapabilities,
  listAgentRuntimeSessions,
  promptAgentSession,
  readAgentRuntimeHistory,
  startAgentSession,
} from "./daemonAgentProcedures";

describe("runtime-neutral agent daemon procedures", () => {
  it("gets the daemon-owned DSH capability without a renderer flag", async () => {
    mocks.request.mockResolvedValue({ dsh: { configured: true, ready: true, incarnation: "run-1" } });

    await expect(getAgentCapabilities()).resolves.toEqual({
      dsh: { configured: true, ready: true, incarnation: "run-1" },
    });
    expect(mocks.request).toHaveBeenCalledWith("agent.getCapabilities", {});
  });

  it("rejects an invalid optional DSH runtime incarnation", async () => {
    mocks.request.mockResolvedValue({ dsh: { configured: true, ready: true, incarnation: 7 } });

    await expect(getAgentCapabilities()).rejects.toThrow("invalid DSH runtime incarnation");
  });

  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("sends start, attach, prompt, abort, and dispose requests to agent RPC methods", async () => {
    mocks.request.mockResolvedValue({ runtime: "pi", ok: true });

    await startAgentSession({
      runtime: "pi",
      sessionId: "session-1",
      tabId: "tab-1",
      paneId: "pane-1",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      resume: true,
    });
    await attachAgentSession({ runtime: "pi", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" });
    await promptAgentSession({
      runtime: "pi",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      message: { text: "Hello" },
      streamingBehavior: "steer",
    });
    await abortAgentSession({ runtime: "pi", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" });
    await disposeAgentSession({ runtime: "pi", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" });

    expect(mocks.request.mock.calls).toEqual([
      ["agent.start", expect.objectContaining({ runtime: "pi", resume: true })],
      ["agent.attach", { runtime: "pi", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" }],
      ["agent.prompt", expect.objectContaining({ message: { text: "Hello" }, streamingBehavior: "steer" })],
      ["agent.abort", { runtime: "pi", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" }],
      ["agent.dispose", { runtime: "pi", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" }],
    ]);
  });

  it("returns runtime-tagged session and history results without interpreting DSH events", async () => {
    mocks.request.mockResolvedValueOnce({ runtime: "dsh", sessions: [] }).mockResolvedValueOnce({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "session-1", createdAt: 1 },
        events: [{ type: "message", seq: 0, time: 1, data: {} }],
        incarnation: "run-1",
        asOfSeq: 0,
        durableThroughSeq: 0,
      },
    });

    await expect(
      listAgentRuntimeSessions({ runtime: "dsh", workspaceId: "workspace-1", cwd: "/workspace" }),
    ).resolves.toEqual({
      runtime: "dsh",
      sessions: [],
    });
    await expect(
      readAgentRuntimeHistory({
        runtime: "dsh",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        cwd: "/workspace",
      }),
    ).resolves.toEqual({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "session-1", createdAt: 1 },
        events: [{ type: "message", seq: 0, time: 1, data: {} }],
        incarnation: "run-1",
        asOfSeq: 0,
        durableThroughSeq: 0,
      },
    });

    expect(mocks.request.mock.calls).toEqual([
      ["agent.listSessions", { runtime: "dsh", workspaceId: "workspace-1", cwd: "/workspace" }],
      ["agent.readHistory", { runtime: "dsh", sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" }],
    ]);
  });

  it("keeps DSH history events unknown at the transport boundary", () => {
    expectTypeOf<AgentDSHHistory["events"][number]>().toEqualTypeOf<unknown>();
  });
});
