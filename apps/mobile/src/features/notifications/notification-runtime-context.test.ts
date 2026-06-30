import { describe, expect, it } from "vitest";

import { resolveAggregateWorkspaceIndicator, resolveWorkspaceIndicator } from "./notification-runtime-context";

describe("notification-runtime-context", () => {
  it("resolves per-workspace indicators with runtime status priority", () => {
    expect(resolveWorkspaceIndicator({ runtimeStatus: "running", unreadTone: "error" })).toBe("running");
    expect(resolveWorkspaceIndicator({ runtimeStatus: "waiting_input", unreadTone: "success" })).toBe("waiting_input");
    expect(resolveWorkspaceIndicator({ runtimeStatus: "idle", unreadTone: "error" })).toBe("failed");
    expect(resolveWorkspaceIndicator({ runtimeStatus: "idle", unreadTone: "success" })).toBe("done");
    expect(resolveWorkspaceIndicator({ runtimeStatus: "idle" })).toBe("none");
  });

  it("resolves aggregate workspace attention with waiting-input and unread priority", () => {
    expect(
      resolveAggregateWorkspaceIndicator({
        workspaceAgentStatusByWorkspaceId: { w1: "running", w2: "waiting_input" },
        workspaceUnreadToneByWorkspaceId: { w3: "success" },
      }),
    ).toBe("waiting_input");

    expect(
      resolveAggregateWorkspaceIndicator({
        workspaceAgentStatusByWorkspaceId: { w1: "running" },
        workspaceUnreadToneByWorkspaceId: { w2: "error", w3: "success" },
      }),
    ).toBe("failed");

    expect(
      resolveAggregateWorkspaceIndicator({
        workspaceAgentStatusByWorkspaceId: { w1: "running" },
        workspaceUnreadToneByWorkspaceId: { w2: "success" },
      }),
    ).toBe("done");

    expect(
      resolveAggregateWorkspaceIndicator({
        workspaceAgentStatusByWorkspaceId: { w1: "running" },
        workspaceUnreadToneByWorkspaceId: {},
      }),
    ).toBe("none");
  });
});
