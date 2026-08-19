import type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
import { subscribeBackendEvent } from "./backendEventRouter";

export type AppActionEventPayload = RpcFrontendMessagePayload<"appAction">;
export type WorkspaceChatEventPayload = RpcFrontendMessagePayload<"chatEvent">;
export type InAppNotificationEventPayload = RpcFrontendMessagePayload<"notificationEvent">;

/** Subscribes to normalized app action events emitted by backend runtime. */
export function subscribeAppActionEvent(listener: (payload: AppActionEventPayload) => void) {
  return subscribeBackendEvent("app.action", (event) => {
    if (event.source !== "appAction") {
      return;
    }

    listener(event.payload);
  });
}

/** Subscribes to normalized workspace chat events emitted by backend runtime. */
export function subscribeWorkspaceChatEvent(listener: (payload: WorkspaceChatEventPayload) => void) {
  return subscribeBackendEvent("chat.event", (event) => {
    if (event.source !== "chatEvent") {
      return;
    }

    listener(event.payload);
  });
}

/** Subscribes to normalized in-app notification events emitted by backend runtime. */
export function subscribeInAppNotificationEvent(listener: (payload: InAppNotificationEventPayload) => void) {
  return subscribeBackendEvent("notification.event", (event) => {
    if (event.source !== "notificationEvent") {
      return;
    }

    listener(event.payload);
  });
}
