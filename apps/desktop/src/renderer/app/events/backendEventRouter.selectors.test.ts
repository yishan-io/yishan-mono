import { describe, expect, it, vi } from "vitest";
import {
  subscribeAppActionEvent,
  subscribeInAppNotificationEvent,
  subscribeWorkspaceChatEvent,
} from "./backendEventRouter.selectors";

const mocked = vi.hoisted(() => {
  const callbacksByName: Record<string, (event: { source: string; payload: unknown }) => void> = {};
  const subscribeBackendEvent = vi.fn(
    (name: string, listener: (event: { source: string; payload: unknown }) => void) => {
      callbacksByName[name] = listener;
      return () => {
        delete callbacksByName[name];
      };
    },
  );

  return {
    callbacksByName,
    subscribeBackendEvent,
  };
});

vi.mock("./backendEventRouter", () => ({
  subscribeBackendEvent: mocked.subscribeBackendEvent,
}));

describe("backendEventSubscriptions", () => {
  it("subscribes each helper to the expected normalized event name", () => {
    const listeners = [
      subscribeAppActionEvent(vi.fn()),
      subscribeInAppNotificationEvent(vi.fn()),
      subscribeWorkspaceChatEvent(vi.fn()),
    ];

    expect(mocked.subscribeBackendEvent).toHaveBeenCalledWith("app.action", expect.any(Function));
    expect(mocked.subscribeBackendEvent).toHaveBeenCalledWith("notification.event", expect.any(Function));
    expect(mocked.subscribeBackendEvent).toHaveBeenCalledWith("chat.event", expect.any(Function));

    for (const unsubscribe of listeners) {
      unsubscribe();
    }
  });

  it("forwards payload only for the matching chat event source", () => {
    const onChatEvent = vi.fn();
    subscribeWorkspaceChatEvent(onChatEvent);

    const callback = mocked.callbacksByName["chat.event"];
    if (!callback) {
      throw new Error("Expected chat.event callback to be registered");
    }

    callback({ source: "appAction", payload: { action: "wrong" } });
    callback({ source: "chatEvent", payload: { workspaceId: "w-1", sessionId: "s-1", event: { type: "delta" } } });

    expect(onChatEvent).toHaveBeenCalledTimes(1);
    expect(onChatEvent).toHaveBeenCalledWith({ workspaceId: "w-1", sessionId: "s-1", event: { type: "delta" } });
  });
});
