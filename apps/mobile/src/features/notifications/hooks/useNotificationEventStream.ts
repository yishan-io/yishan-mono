import { useWorkspaceFrontendEventsStream } from "@/features/workspaces/useWorkspaceFrontendEventsStream";

import type { FrontendEventsWebSocketMessage, NodeConnectionMeta } from "../notification-runtime-helpers";

type UseNotificationEventStreamOptions = {
  accessToken: string | null;
  enabled: boolean;
  nodes: NodeConnectionMeta[];
  onMessage: (input: { message: FrontendEventsWebSocketMessage; node: NodeConnectionMeta }) => void;
};

/** Owns per-node frontend-events websocket lifecycle and reconnect policy. */
export function useNotificationEventStream({
  accessToken,
  enabled,
  nodes,
  onMessage,
}: UseNotificationEventStreamOptions) {
  useWorkspaceFrontendEventsStream({
    accessToken,
    enabled,
    nodes,
    onMessage,
  });
}
