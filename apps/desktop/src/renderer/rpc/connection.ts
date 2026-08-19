import { delay } from "@renderer/async/delay";
import { getDesktopHostBridge } from "../platform/hostBridge";

const SOCKET_CONNECT_RETRY_COUNT = 30;
const SOCKET_CONNECT_RETRY_DELAY_MS = 500;
// Identifies the Yishan desktop app to the daemon. The daemon uses this to
// decide how workspace task runs execute: agent chat tab when a desktop UI is
// connected, pi CLI terminal otherwise (headless/remote daemons).
const DESKTOP_WS_CLIENT_PARAM = "client=desktop";

/** Appends the desktop client marker to a daemon WebSocket URL. */
function withDesktopClientParam(wsUrl: string): string {
  const separator = wsUrl.includes("?") ? "&" : "?";
  return `${wsUrl}${separator}${DESKTOP_WS_CLIENT_PARAM}`;
}

async function getDaemonWsUrl(): Promise<string> {
  const info = await getDesktopHostBridge().getDaemonInfo();
  const wsUrl = info.wsUrl?.trim();
  if (!wsUrl) {
    throw new Error("Daemon websocket endpoint is unavailable.");
  }
  return wsUrl;
}

/**
 * Opens one daemon WebSocket with bounded retries (desktop8 Phase 31:
 * host discovery + socket retry owned by rpc/connection).
 */
export async function openDaemonSocket(): Promise<WebSocket> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= SOCKET_CONNECT_RETRY_COUNT; attempt += 1) {
    try {
      const wsUrl = withDesktopClientParam(await getDaemonWsUrl());
      return await new Promise<WebSocket>((resolvePromise, rejectPromise) => {
        const socket = new WebSocket(wsUrl);
        let settled = false;

        const resolveOnce = (value: WebSocket) => {
          if (settled) {
            return;
          }
          settled = true;
          resolvePromise(value);
        };

        const rejectOnce = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          rejectPromise(error);
        };

        socket.addEventListener("open", () => {
          resolveOnce(socket);
        });

        socket.addEventListener("error", () => {
          rejectOnce(new Error("failed to connect to daemon websocket"));
        });

        socket.addEventListener("close", () => {
          rejectOnce(new Error("daemon websocket closed before opening"));
        });
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("failed to connect to daemon websocket");
      if (attempt === SOCKET_CONNECT_RETRY_COUNT) {
        break;
      }

      await delay(SOCKET_CONNECT_RETRY_DELAY_MS);
    }
  }

  throw lastError ?? new Error("failed to connect to daemon websocket");
}
