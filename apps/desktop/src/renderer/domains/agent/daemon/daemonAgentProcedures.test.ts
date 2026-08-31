import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AgentCancelSubagentResult, AgentDSHHistory, AgentSessionLineageResult } from "./daemonAgentTypes";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@renderer/rpc", () => ({ request: mocks.request }));

import {
  abortAgentSession,
  attachAgentSession,
  cancelAgentSubagent,
  disposeAgentSession,
  getAgentCapabilities,
  listAgentRuntimeSessions,
  listAgentSessionLineage,
  promptAgentSession,
  readAgentRuntimeHistory,
  startAgentSession,
} from "./daemonAgentProcedures";

describe("runtime-neutral agent daemon procedures", () => {
  it("gets the daemon-owned DSH capability without a renderer flag", async () => {
    mocks.request.mockResolvedValue({
      dsh: { configured: true, ready: true, instanceId: "run-1", transcriptProtocolVersion: 3 },
    });

    await expect(getAgentCapabilities()).resolves.toEqual({
      dsh: { configured: true, ready: true, instanceId: "run-1", transcriptProtocolVersion: 3 },
    });
    expect(mocks.request).toHaveBeenCalledWith("agent.getCapabilities", {});
  });

  it("rejects an invalid optional DSH runtime instance ID", async () => {
    mocks.request.mockResolvedValue({
      dsh: { configured: true, ready: true, instanceId: 7, transcriptProtocolVersion: 3 },
    });

    await expect(getAgentCapabilities()).rejects.toThrow("invalid DSH runtime instance ID");
  });

  it("rejects an unsupported DSH transcript protocol", async () => {
    mocks.request.mockResolvedValue({
      dsh: { configured: true, ready: true, instanceId: "run-1", transcriptProtocolVersion: 1 },
    });

    await expect(getAgentCapabilities()).rejects.toThrow("unsupported DSH transcript protocol");
  });

  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("sends start, attach, prompt, abort, and dispose requests to agent RPC methods", async () => {
    mocks.request
      .mockResolvedValueOnce({ runtime: "pi", sessionId: "session-1" })
      .mockResolvedValue({ runtime: "pi", ok: true });

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

  it("adds the negotiated transcript version to DSH transcript requests", async () => {
    mocks.request
      .mockResolvedValueOnce({
        runtime: "dsh",
        sessionId: "session-1",
        dshAttachSnapshot: {
          runtime: "dsh",
          sessionId: "session-1",
          instanceId: "run-1",
          events: [],
          asOfSeq: -1,
          durableThroughSeq: -1,
          headSeq: -1,
        },
      })
      .mockResolvedValueOnce({
        runtime: "dsh",
        sessionId: "session-1",
        instanceId: "run-1",
        events: [],
        asOfSeq: -1,
        durableThroughSeq: -1,
        headSeq: -1,
      });

    await startAgentSession({
      runtime: "dsh",
      sessionId: "session-1",
      tabId: "tab-1",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
    await attachAgentSession({
      runtime: "dsh",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      afterSeq: -1,
    });

    expect(mocks.request.mock.calls).toEqual([
      ["agent.start", expect.objectContaining({ runtime: "dsh", transcriptProtocolVersion: 3 })],
      ["agent.attach", expect.objectContaining({ runtime: "dsh", transcriptProtocolVersion: 3 })],
    ]);
  });

  it("returns runtime-tagged session and history results without interpreting DSH events", async () => {
    mocks.request.mockResolvedValueOnce({ runtime: "dsh", sessions: [] }).mockResolvedValueOnce({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "session-1", createdAt: 1 },
        events: [{ type: "message", seq: 0, time: 1, data: {} }],
        instanceId: "run-1",
        asOfSeq: 0,
        durableThroughSeq: 0,
        filePath: "/sessions/session-1/session.jsonl.zstd",
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
        instanceId: "run-1",
        asOfSeq: 0,
        durableThroughSeq: 0,
        filePath: "/sessions/session-1/session.jsonl.zstd",
      },
    });

    expect(mocks.request.mock.calls).toEqual([
      ["agent.listSessions", { runtime: "dsh", workspaceId: "workspace-1", cwd: "/workspace" }],
      [
        "agent.readHistory",
        {
          runtime: "dsh",
          sessionId: "session-1",
          workspaceId: "workspace-1",
          cwd: "/workspace",
          transcriptProtocolVersion: 3,
        },
      ],
    ]);
  });

  it("lists DSH session lineage with the exact RPC payload and parses its typed result", async () => {
    const request = {
      runtime: "dsh" as const,
      workspaceId: "workspace-1",
      cwd: "/workspace",
      rootSessionId: "root-1",
      mode: "descendants" as const,
    };
    const response: AgentSessionLineageResult = {
      runtime: "dsh",
      rootSessionId: "root-1",
      mode: "descendants",
      children: [
        {
          sessionId: "child-1",
          parentSessionId: "root-1",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: true,
          persisted: true,
          activity: "running",
          mode: "continuable",
          label: "worker",
        },
      ],
    };
    mocks.request.mockResolvedValue(response);

    await expect(listAgentSessionLineage(request)).resolves.toEqual(response);
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith("agent.listSessionLineage", request);
  });

  it("cancels a DSH direct child with the exact RPC payload and typed receipt", async () => {
    const request = {
      runtime: "dsh" as const,
      workspaceId: "workspace-1",
      cwd: "/workspace",
      parentSessionId: "parent-1",
      childSessionId: "child-1",
    };
    const receipt: AgentCancelSubagentResult = {
      runtime: "dsh",
      parentSessionId: "parent-1",
      childSessionId: "child-1",
      interruptRequested: true,
    };
    mocks.request.mockResolvedValue(receipt);

    await expect(cancelAgentSubagent(request)).resolves.toEqual(receipt);
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith("agent.cancelSubagent", request);
  });

  it("rejects malformed DSH session lineage results", async () => {
    mocks.request.mockResolvedValue({ runtime: "dsh", rootSessionId: "root-1", mode: "children", children: [{}] });

    await expect(
      listAgentSessionLineage({
        runtime: "dsh",
        workspaceId: "workspace-1",
        cwd: "/workspace",
        rootSessionId: "root-1",
        mode: "children",
      }),
    ).rejects.toThrow("sessionId is required");
  });

  it("exposes a strict DSH session lineage result", () => {
    expectTypeOf<Awaited<ReturnType<typeof listAgentSessionLineage>>>().toEqualTypeOf<AgentSessionLineageResult>();
  });

  it("keeps DSH history events unknown at the transport boundary", () => {
    expectTypeOf<AgentDSHHistory["events"][number]>().toEqualTypeOf<unknown>();
  });
});
