import { upgradeWebSocket } from "hono/bun";

import { RelayStreamClient } from "@/lib/relay-stream-client";
import type { WorkspaceTerminalParamsInput } from "@/validation/project";

type ClientMessage =
  | {
      type: "ping";
    }
  | {
      type: "unsubscribe";
    };

function parseClientMessage(payload: string): ClientMessage {
  const decoded = JSON.parse(payload) as Record<string, unknown>;
  const type = typeof decoded.type === "string" ? decoded.type : null;
  if (!type) {
    throw new Error("Frontend events websocket message type is required");
  }

  switch (type) {
    case "ping":
    case "unsubscribe":
      return { type };
    default:
      throw new Error("Unsupported frontend events websocket message");
  }
}

export const workspaceFrontendEventsStreamHandler = upgradeWebSocket((c) => {
  const params: WorkspaceTerminalParamsInput = {
    orgId: c.req.param("orgId") ?? "",
    projectId: c.req.param("projectId") ?? "",
    workspaceId: c.req.param("workspaceId") ?? "",
  };
  const actorUser = c.get("sessionUser");
  const services = c.get("services");

  let relayClient: RelayStreamClient | null = null;
  let closed = false;

  const closeRelay = () => {
    relayClient?.close();
    relayClient = null;
  };

  return {
    onClose: () => {
      closed = true;
      closeRelay();
    },
    onError: (_event, ws) => {
      if (!closed && ws.readyState === 1) {
        ws.send(JSON.stringify({ message: "Frontend events websocket failed.", type: "error" }));
      }
      closeRelay();
    },
    onMessage: (event, ws) => {
      void (async () => {
        try {
          if (typeof event.data !== "string") {
            return;
          }

          const message = parseClientMessage(event.data);
          if (message.type === "ping") {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "pong" }));
            }
            return;
          }

          if (message.type === "unsubscribe") {
            ws.close(1000, "Client unsubscribed");
          }
        } catch (error) {
          if (!closed && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                message: error instanceof Error ? error.message : "Frontend events websocket request failed.",
                type: "error",
              }),
            );
          }
        }
      })();
    },
    onOpen: (_event, ws) => {
      void (async () => {
        try {
          const relayAccess = await services.workspace.resolveRelayAccess({
            actorUserId: actorUser.id,
            organizationId: params.orgId,
            projectId: params.projectId,
            workspaceId: params.workspaceId,
          });

          relayClient = new RelayStreamClient(
            {
              apiToken: relayAccess.relayApiToken,
              nodeId: relayAccess.workspace.nodeId,
              relayUrl: relayAccess.relayUrl,
            },
            {
              onClose: () => {
                if (!closed && ws.readyState === 1) {
                  ws.send(JSON.stringify({ message: "Frontend events relay disconnected.", type: "error" }));
                  ws.close(1011, "Relay disconnected");
                }
              },
              onError: (error) => {
                if (!closed && ws.readyState === 1) {
                  ws.send(JSON.stringify({ message: error.message, type: "error" }));
                }
              },
              onFrontendEvent: ({ payload, topic }) => {
                if (!closed && ws.readyState === 1) {
                  ws.send(JSON.stringify({ payload, topic, type: "event" }));
                }
              },
            },
          );

          await relayClient.connect();
          await relayClient.sendRequest("events.frontendStream", {});

          if (!closed && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "ready" }));
          }
        } catch (error) {
          if (!closed && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                message: error instanceof Error ? error.message : "Failed to connect frontend events websocket.",
                type: "error",
              }),
            );
            ws.close(1011, "Frontend events stream setup failed");
          }
          closeRelay();
        }
      })();
    },
  };
});
