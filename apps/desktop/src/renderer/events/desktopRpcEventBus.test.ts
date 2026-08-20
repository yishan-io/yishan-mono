import type { DaemonNotification } from "@renderer/rpc";
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn((_method: string, _params: unknown, _listener: (event: DaemonNotification) => void) => () => {}),
}));

vi.mock("@renderer/rpc", () => ({
  subscribe: mocks.subscribe,
}));

import { subscribeDesktopRpcEvent } from "./desktopRpcEventBus";

/**
 * Regression coverage for the desktop8 refactor bug where the
 * `events.frontendStream` notification was unwrapped via `params.result.topic`
 * while the daemon sends `{ topic, payload }` directly in the params. The
 * wrong unwrap made every backend event (including `agent.pi.event`) fall
 * through with the raw method name, so agent-chat never received its pi
 * session responses and stayed in the loading state forever.
 */
describe("desktopRpcEventBus frontend stream unwrap", () => {
  it("emits the daemon's top-level topic as the envelope method", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDesktopRpcEvent(listener);

    const registered = mocks.subscribe.mock.calls[0];
    expect(registered?.[0]).toBe("events.frontendStream");
    const onNotification = registered?.[2] as ((event: DaemonNotification) => void) | undefined;
    expect(onNotification).toBeTypeOf("function");

    onNotification?.({
      method: "events.frontendStream",
      payload: {
        topic: "agent.pi.event",
        payload: { sessionId: "s1", tabId: "t1", event: { type: "response" } },
      },
    });

    expect(listener).toHaveBeenCalledWith({
      method: "agent.pi.event",
      payload: { sessionId: "s1", tabId: "t1", event: { type: "response" } },
    });

    // The same transport callback also tolerates a wrapped result shape.
    onNotification?.({
      method: "events.frontendStream",
      payload: {
        result: {
          topic: "git.changed",
          payload: { workspaceId: "w1" },
        },
      },
    });

    expect(listener).toHaveBeenCalledWith({
      method: "git.changed",
      payload: { workspaceId: "w1" },
    });

    unsubscribe();
  });
});
