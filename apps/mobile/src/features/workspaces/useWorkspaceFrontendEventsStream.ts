import { useEffect } from "react";

import { readWebSocketTextMessage } from "@/lib/api/websocketMessage";
import {
  type WorkspaceFrontendEventsConnection,
  type WorkspaceFrontendEventsMessage,
  parseWorkspaceFrontendEventsMessage,
} from "./workspace-frontend-events";
import { buildWorkspaceFrontendEventsWebSocketUrl } from "./workspaces.api";

type ReactNativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

type UseWorkspaceFrontendEventsStreamOptions = {
  accessToken: string | null;
  enabled: boolean;
  nodes: WorkspaceFrontendEventsConnection[];
  onMessage: (input: {
    message: WorkspaceFrontendEventsMessage;
    node: WorkspaceFrontendEventsConnection;
  }) => void;
};

/** Owns per-node frontend-events websocket lifecycle and reconnect policy. */
export function useWorkspaceFrontendEventsStream({
  accessToken,
  enabled,
  nodes,
  onMessage,
}: UseWorkspaceFrontendEventsStreamOptions) {
  useEffect(() => {
    const socketByNodeId: Record<string, WebSocket> = {};
    const reconnectTimeoutByNodeId: Record<string, ReturnType<typeof setTimeout>> = {};
    const keepAliveIntervalByNodeId: Record<string, ReturnType<typeof setInterval>> = {};

    if (!enabled || !accessToken) {
      return;
    }

    let disposed = false;
    const nodeIds = new Set(nodes.map((node) => node.nodeId));

    const scheduleReconnect = (node: WorkspaceFrontendEventsConnection) => {
      if (disposed || reconnectTimeoutByNodeId[node.nodeId] || !nodeIds.has(node.nodeId)) {
        return;
      }

      reconnectTimeoutByNodeId[node.nodeId] = setTimeout(() => {
        delete reconnectTimeoutByNodeId[node.nodeId];
        connect(node);
      }, 2_000);
    };

    const connect = (node: WorkspaceFrontendEventsConnection) => {
      if (disposed || socketByNodeId[node.nodeId]) {
        return;
      }

      const WebSocketCtor = globalThis.WebSocket as unknown as ReactNativeWebSocketConstructor;
      const socket = new WebSocketCtor(
        buildWorkspaceFrontendEventsWebSocketUrl(node.orgId, node.projectId, node.workspaceId, accessToken),
      );

      socketByNodeId[node.nodeId] = socket;
      keepAliveIntervalByNodeId[node.nodeId] = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 20_000);

      socket.onmessage = (event) => {
        void (async () => {
          try {
            const payload = await readWebSocketTextMessage(event.data);
            if (!payload) {
              return;
            }

            const message = parseWorkspaceFrontendEventsMessage(payload);
            onMessage({ message, node });
          } catch {
            return;
          }
        })();
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (socketByNodeId[node.nodeId] === socket) {
          delete socketByNodeId[node.nodeId];
        }
        if (keepAliveIntervalByNodeId[node.nodeId]) {
          clearInterval(keepAliveIntervalByNodeId[node.nodeId]);
          delete keepAliveIntervalByNodeId[node.nodeId];
        }
        scheduleReconnect(node);
      };
    };

    for (const node of nodes) {
      connect(node);
    }

    return () => {
      disposed = true;
      for (const nodeId of Object.keys(reconnectTimeoutByNodeId)) {
        clearTimeout(reconnectTimeoutByNodeId[nodeId]);
      }
      for (const nodeId of Object.keys(keepAliveIntervalByNodeId)) {
        clearInterval(keepAliveIntervalByNodeId[nodeId]);
      }
      for (const nodeId of Object.keys(socketByNodeId)) {
        socketByNodeId[nodeId]?.close();
      }
    };
  }, [accessToken, enabled, nodes, onMessage]);
}
