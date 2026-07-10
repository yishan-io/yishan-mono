import { describe, expect, it, vi } from "vitest";

vi.mock("hono/bun", () => ({
  upgradeWebSocket: vi.fn((handler) => handler),
}));

describe("openTerminalRelaySession", () => {
  it("opens the workspace ephemerally before subscribing to the terminal session", async () => {
    const { openTerminalRelaySession } = await import("@/handlers/workspace-terminal-stream");
    const relayClient = {
      sendRequest: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          snapshot: {
            output: "ready",
            running: true,
          },
          subscribed: true,
        }),
    };

    const subscribeResult = await openTerminalRelaySession({
      relayAccess: {
        workspace: {
          id: "workspace-1",
          localPath: "/tmp/workspace-1",
          nodeId: "node-1",
        },
      } as never,
      relayClient: relayClient as never,
      sessionId: "session-1",
    });

    expect(relayClient.sendRequest).toHaveBeenNthCalledWith(1, "workspace.open", {
      ephemeral: true,
      id: "workspace-1",
      path: "/tmp/workspace-1",
    });
    expect(relayClient.sendRequest).toHaveBeenNthCalledWith(2, "terminal.subscribe", {
      sessionId: "session-1",
    });
    expect(subscribeResult).toEqual({
      snapshot: {
        output: "ready",
        running: true,
      },
      subscribed: true,
    });
  });
});
