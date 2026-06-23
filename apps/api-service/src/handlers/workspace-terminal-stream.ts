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
import type { WorkspaceTerminalSessionParamsInput } from "@/validation/project";

type ClientMessage =
  | {
      type: "input";
      input: string;
    }
  | {
      type: "ping";
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    }
  | {
      type: "unsubscribe";
    };

type TerminalSubscribeSnapshot = {
  exitCode?: number | null;
  output: string;
  running: boolean;
};

type TerminalSubscribeResult = {
  snapshot?: TerminalSubscribeSnapshot;
  subscribed: boolean;
};

function parseClientMessage(payload: string): ClientMessage {
  const decoded = readRelayBridgeMessageRecord(payload, "Terminal");
  const type = decoded.type;

  switch (type) {
    case "input":
      return {
        input: typeof decoded.input === "string" ? decoded.input : "",
        type,
      };
    case "resize":
      return {
        cols: typeof decoded.cols === "number" ? decoded.cols : 0,
        rows: typeof decoded.rows === "number" ? decoded.rows : 0,
        type,
      };
    case "ping":
    case "unsubscribe":
      return { type };
    default:
      throw new Error("Unsupported terminal websocket message");
  }
}

export const workspaceTerminalStreamHandler = upgradeWebSocket((c) => {
  const params: WorkspaceTerminalSessionParamsInput = {
    orgId: c.req.param("orgId") ?? "",
    projectId: c.req.param("projectId") ?? "",
    sessionId: c.req.param("sessionId") ?? "",
    workspaceId: c.req.param("workspaceId") ?? "",
  };
  const actorUser = c.get("sessionUser");
  const services = c.get("services");

  const state = createRelayBridgeState();
  let ready = false;

  return {
    onClose: () => {
      handleRelayBridgeSocketClose(state);
    },
    onError: (_event, ws) => {
      handleRelayBridgeSocketError(state, ws, "Terminal websocket failed.");
    },
    onMessage: (event, ws) => {
      void (async () => {
        try {
          if (typeof event.data !== "string") {
            return;
          }

          const message = parseClientMessage(event.data);
          if (message.type === "ping" || message.type === "unsubscribe") {
            handleRelayBridgeControlMessage(ws, message);
            return;
          }

          const relayClient = state.relayClient;
          if (!relayClient || !ready) {
            sendRelayBridgeError(ws, "Terminal websocket is not ready.");
            return;
          }

          if (message.type === "input") {
            if (!message.input) {
              return;
            }

            await relayClient.sendRequest("terminal.send", {
              input: message.input,
              sessionId: params.sessionId,
              workspaceId: params.workspaceId,
            });
            return;
          }

          if (message.cols <= 0 || message.rows <= 0) {
            return;
          }

          await relayClient.sendRequest("terminal.resize", {
            cols: message.cols,
            rows: message.rows,
            sessionId: params.sessionId,
            workspaceId: params.workspaceId,
          });
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
          const { relayAccess, relayClient } = await connectWorkspaceRelayStream({
            handlers: createRelayStreamEventHandlers({
              handlers: {
                onTerminalExit: ({ exitCode, sessionId }) => {
                  if (sessionId === params.sessionId) {
                    sendRelayBridgeJson(ws, { exitCode, sessionId, type: "exit" });
                  }
                },
                onTerminalOutput: ({ output, sessionId }) => {
                  if (sessionId === params.sessionId) {
                    sendRelayBridgeJson(ws, { output, sessionId, type: "output" });
                  }
                },
              },
              relayDisconnectedMessage: "Terminal relay disconnected.",
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

          await relayClient.sendRequest("workspace.open", {
            id: relayAccess.workspace.id,
            path: relayAccess.workspace.localPath,
          });
          const subscribeResult = await relayClient.sendRequest<TerminalSubscribeResult>("terminal.subscribe", {
            sessionId: params.sessionId,
            workspaceId: params.workspaceId,
          });

          const snapshot = subscribeResult.snapshot;
          if (snapshot) {
            sendRelayBridgeJson(ws, {
              exitCode: snapshot.exitCode ?? null,
              output: snapshot.output,
              running: snapshot.running,
              sessionId: params.sessionId,
              type: "snapshot",
            });
          }

          ready = true;
          sendRelayBridgeJson(ws, { sessionId: params.sessionId, type: "ready" });
        } catch (error) {
          if (!state.closed) {
            sendRelayBridgeError(ws, getErrorMessage(error));
            ws.close(1011, "Terminal stream setup failed");
          }
          closeRelayBridgeConnection(state);
        }
      })();
    },
  };
});
