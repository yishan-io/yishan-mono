// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { listAgentDetectionStatuses } from "./agentCommands";

const mocks = vi.hoisted(() => ({
  listDetectionStatuses: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getApiServiceClient: vi.fn(async () => ({
    agent: {
      listDetectionStatuses: mocks.listDetectionStatuses,
    },
  })),
  getDaemonRpcClient: vi.fn(async () => ({
    agent: {
      listDetectionStatuses: mocks.listDetectionStatuses,
    },
  })),
}));

describe("agentCommands", () => {
  it("normalizes detection statuses in supported-agent order", async () => {
    mocks.listDetectionStatuses.mockResolvedValueOnce([
      { agentKind: "claude", detected: true },
      { agentKind: "codex", detected: 1 },
      { agentKind: "ignored", detected: true },
    ]);

    const statuses = await listAgentDetectionStatuses();

    expect(statuses).toEqual([
      { agentKind: "opencode", detected: false },
      { agentKind: "codex", detected: true },
      { agentKind: "claude", detected: true },
    ]);
  });
});
