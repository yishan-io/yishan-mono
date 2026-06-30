import { upgradeWebSocket } from "hono/bun";

import {
  closeRelayBridgeConnection,
  connectWorkspaceRelayStream,
  createRelayBridgeState,
  createRelayStreamEventHandlers,
  handleRelayBridgeControlMessage,
  handleRelayBridgeSocketClose,
  handleRelayBridgeSocketError,
  readRelayBridgeMessageRecord,
  sendRelayBridgeError,
  sendRelayBridgeJson,
} from "@/handlers/shared/workspaceRelayStreamBridge";
import { getErrorMessage } from "@/lib/errors";
import type { WorkspaceTerminalParamsInput } from "@/validation/project";

type ClientMessage =
  | {
      type: "ping";
    }
  | {
      type: "unsubscribe";
    };

function parseClientMessage(payload: string): ClientMessage {
  const decoded = readRelayBridgeMessageRecord(payload, "Frontend events");
  const type = decoded.type;

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

  const state = createRelayBridgeState();

  return {
    onClose: () => {
      handleRelayBridgeSocketClose(state);
    },
    onError: (_event, ws) => {
      handleRelayBridgeSocketError(state, ws, "Frontend events websocket failed.");
    },
    onMessage: (event, ws) => {
      void (async () => {
        try {
          if (typeof event.data !== "string") {
            return;
          }

          const message = parseClientMessage(event.data);
          handleRelayBridgeControlMessage(ws, message);
        } catch (error) {
          if (!state.closed) {
            sendRelayBridgeError(ws, getErrorMessage(error));
          }
        }
      })();
    },
    onOpen: (_event, ws) => {
      void (async () => {
        try {
          const { relayClient } = await connectWorkspaceRelayStream({
            handlers: createRelayStreamEventHandlers({
              handlers: {
                onFrontendEvent: ({ payload, topic }) => {
                  sendRelayBridgeJson(ws, { payload, topic, type: "event" });
                },
              },
              relayDisconnectedMessage: "Frontend events relay disconnected.",
              state,
              ws,
            }),
            relayAccessInput: {
              actorUserId: actorUser.id,
              orgId: params.orgId,
              projectId: params.projectId,
              workspaceId: params.workspaceId,
            },
            services,
            state,
          });

          await relayClient.sendRequest("events.frontendStream", {});

          sendRelayBridgeJson(ws, { type: "ready" });
        } catch (error) {
          if (!state.closed) {
            sendRelayBridgeError(ws, getErrorMessage(error));
            ws.close(1011, "Frontend events stream setup failed");
          }
          closeRelayBridgeConnection(state);
        }
      })();
    },
  };
});
