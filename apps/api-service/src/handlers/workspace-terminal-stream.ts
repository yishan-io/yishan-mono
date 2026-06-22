import { upgradeWebSocket } from "hono/bun";

import { RelayStreamClient } from "@/lib/relay-stream-client";
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
  const decoded = JSON.parse(payload) as Record<string, unknown>;
  const type = typeof decoded.type === "string" ? decoded.type : null;
  if (!type) {
    throw new Error("Terminal websocket message type is required");
  }

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

  let relayClient: RelayStreamClient | null = null;
  let ready = false;
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
        ws.send(JSON.stringify({ message: "Terminal websocket failed.", type: "error" }));
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
            return;
          }

          if (!relayClient || !ready) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ message: "Terminal websocket is not ready.", type: "error" }));
            }
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
          if (!closed && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                message: error instanceof Error ? error.message : "Terminal websocket request failed.",
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
                  ws.send(JSON.stringify({ message: "Terminal relay disconnected.", type: "error" }));
                  ws.close(1011, "Relay disconnected");
                }
              },
              onError: (error) => {
                if (!closed && ws.readyState === 1) {
                  ws.send(JSON.stringify({ message: error.message, type: "error" }));
                }
              },
              onTerminalExit: ({ exitCode, sessionId }) => {
                if (!closed && ws.readyState === 1 && sessionId === params.sessionId) {
                  ws.send(JSON.stringify({ exitCode, sessionId, type: "exit" }));
                }
              },
              onTerminalOutput: ({ output, sessionId }) => {
                if (!closed && ws.readyState === 1 && sessionId === params.sessionId) {
                  ws.send(JSON.stringify({ output, sessionId, type: "output" }));
                }
              },
            },
          );

          await relayClient.connect();
          await relayClient.sendRequest("workspace.open", {
            id: relayAccess.workspace.id,
            path: relayAccess.workspace.localPath,
          });
          const subscribeResult = await relayClient.sendRequest<TerminalSubscribeResult>("terminal.subscribe", {
            sessionId: params.sessionId,
            workspaceId: params.workspaceId,
          });

          const snapshot = subscribeResult.snapshot;
          if (snapshot?.output && !closed && ws.readyState === 1) {
            ws.send(JSON.stringify({ output: snapshot.output, sessionId: params.sessionId, type: "output" }));
          }
          if (snapshot && !snapshot.running && !closed && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                exitCode: snapshot.exitCode ?? null,
                sessionId: params.sessionId,
                type: "exit",
              }),
            );
          }

          ready = true;
          if (!closed && ws.readyState === 1) {
            ws.send(JSON.stringify({ sessionId: params.sessionId, type: "ready" }));
          }
        } catch (error) {
          if (!closed && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                message: error instanceof Error ? error.message : "Failed to connect terminal websocket.",
                type: "error",
              }),
            );
            ws.close(1011, "Terminal stream setup failed");
          }
          closeRelay();
        }
      })();
    },
  };
});
