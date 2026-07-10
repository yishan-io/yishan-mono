import { useEffect, useRef } from "react";

import { getRelayBaseUrl } from "@/lib/config/env";
import { subscribeRelayFrontendEvents } from "@/lib/relay/relay-frontend-event-hub";
import type { WorkspaceFrontendEventsConnection, WorkspaceFrontendEventsMessage } from "./workspace-frontend-events";

type UseWorkspaceFrontendEventsStreamOptions = {
  accessToken: string | null;
  enabled: boolean;
  nodes: WorkspaceFrontendEventsConnection[];
  onMessage: (input: {
    message: WorkspaceFrontendEventsMessage;
    node: WorkspaceFrontendEventsConnection;
  }) => void;
};

/** Owns per-node direct relay frontend-events stream lifecycle and reconnect policy. */
export function useWorkspaceFrontendEventsStream({
  accessToken,
  enabled,
  nodes,
  onMessage,
}: UseWorkspaceFrontendEventsStreamOptions) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !accessToken) {
      return;
    }

    const relayUrl = getRelayBaseUrl();
    const unsubscribeHandlers = nodes.map((node) =>
      subscribeRelayFrontendEvents({
        accessToken,
        node,
        onMessage: (input) => {
          onMessageRef.current(input);
        },
        relayUrl,
      }),
    );

    return () => {
      for (const unsubscribe of unsubscribeHandlers) {
        unsubscribe();
      }
    };
  }, [accessToken, enabled, nodes]);
}
