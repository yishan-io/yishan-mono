// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { listAgentDetectionStatuses } from "./agentCommands";

const mocks = vi.hoisted(() => ({
  listDetectionStatuses: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    agent: {
      listDetectionStatuses: mocks.listDetectionStatuses,
    },
  })),
}));

describe("agentCommands", () => {
  it("normalizes detection statuses in supported-agent order", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.listDetectionStatuses.mockResolvedValueOnce([
      { agentKind: "claude", detected: true },
      { agentKind: "codex", detected: 1 },
      { agentKind: "ignored", detected: true },
    ]);

    const statuses = await listAgentDetectionStatuses();

    expect(mocks.listDetectionStatuses).toHaveBeenCalledWith(undefined);

    expect(statuses).toEqual([
      { agentKind: "opencode", detected: false },
      { agentKind: "codex", detected: true },
      { agentKind: "claude", detected: true },
      { agentKind: "gemini", detected: false },
      { agentKind: "pi", detected: false },
      { agentKind: "copilot", detected: false },
      { agentKind: "cursor", detected: false },
    ]);

    expect(consoleInfoSpy).toHaveBeenCalledWith("[agentCommands] Ignoring unsupported detected CLI tools: ignored");
    consoleInfoSpy.mockRestore();
  });

  it("passes refresh flag for manual recheck", async () => {
    mocks.listDetectionStatuses.mockResolvedValueOnce([]);

    await listAgentDetectionStatuses(true);

    expect(mocks.listDetectionStatuses).toHaveBeenCalledWith({ refresh: true });
  });
});
