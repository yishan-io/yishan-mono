import { describe, expect, it } from "vitest";

import {
  canAttachTerminalTransport,
  createRuntimeSnapshot,
  isCurrentRuntimeSnapshot,
  shouldReuseTerminalTransport,
} from "./terminal-transport-controller-domain";

describe("terminal-transport-controller-domain", () => {
  it("creates an empty runtime snapshot", () => {
    expect(createRuntimeSnapshot()).toEqual({
      ensuredSessionId: null,
      ensuring: false,
      exited: false,
      starting: false,
      transportSessionId: null,
    });
  });

  it("allows transport attach only for authenticated sessions with token and session id", () => {
    expect(
      canAttachTerminalTransport({
        accessToken: "token",
        sessionId: "session-1",
        status: "authenticated",
      }),
    ).toBe(true);

    expect(
      canAttachTerminalTransport({
        accessToken: null,
        sessionId: "session-1",
        status: "authenticated",
      }),
    ).toBe(false);
  });

  it("reuses transport only when an existing transport already targets the same session", () => {
    expect(shouldReuseTerminalTransport(true, "session-1", "session-1")).toBe(true);
    expect(shouldReuseTerminalTransport(true, "session-1", "session-2")).toBe(false);
    expect(shouldReuseTerminalTransport(false, "session-1", "session-1")).toBe(false);
  });

  it("detects when a runtime snapshot has been replaced or removed", () => {
    const snapshot = createRuntimeSnapshot();

    expect(isCurrentRuntimeSnapshot(snapshot, snapshot)).toBe(true);
    expect(isCurrentRuntimeSnapshot(null, snapshot)).toBe(false);
    expect(isCurrentRuntimeSnapshot(createRuntimeSnapshot(), snapshot)).toBe(false);
  });
});
