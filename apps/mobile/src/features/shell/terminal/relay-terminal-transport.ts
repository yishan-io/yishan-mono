import type { WorkspaceTerminalOutput } from "@/features/workspaces/workspaces.types";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { RelayStreamClient } from "@/lib/relay/relay-stream-client";
import type { TerminalTransport, TerminalTransportHandlers, TerminalTransportSize } from "./terminal-transport";

type TerminalSubscribeSnapshot = {
  exitCode?: number | null;
  output: string;
  running: boolean;
};

type TerminalSubscribeResult = {
  snapshot?: TerminalSubscribeSnapshot;
  subscribed: boolean;
};

type CreateRelayTerminalTransportInput = {
  accessToken: string;
  handlers: TerminalTransportHandlers;
  nodeId: string;
  relayUrl: string;
  sessionId: string;
};

/** Owns one direct relay-backed terminal stream for one terminal session. */
export function createRelayTerminalTransport({
  accessToken,
  handlers,
  nodeId,
  relayUrl,
  sessionId,
}: CreateRelayTerminalTransportInput): TerminalTransport {
  let connectPromise: Promise<void> | null = null;
  let disposed = false;
  let lastSentSizeKey: string | null = null;
  let lastSize: TerminalTransportSize | null = null;
  let ready = false;
  let terminalExited = false;

  const client = new RelayStreamClient(
    {
      accessToken,
      nodeId,
      relayUrl,
    },
    {
      onClose: () => {
        if (!disposed && !terminalExited) {
          handlers.onError(new Error("Terminal relay disconnected."));
        }
      },
      onError: (error) => {
        if (!disposed && !terminalExited) {
          handlers.onError(error);
        }
      },
      onTerminalExit: (event) => {
        if (event.sessionId !== sessionId) {
          return;
        }

        terminalExited = true;
        handlers.onExit(event.exitCode);
      },
      onTerminalOutput: (event) => {
        if (event.sessionId !== sessionId) {
          return;
        }

        handlers.onOutput(event.output);
      },
    },
  );

  const getSizeKey = (size: TerminalTransportSize) => `${size.cols}x${size.rows}`;

  const applySnapshot = (snapshot: TerminalSubscribeSnapshot | undefined) => {
    if (!snapshot) {
      return;
    }

    terminalExited = !snapshot.running;
    handlers.onSnapshot({
      exitCode: snapshot.exitCode ?? null,
      output: snapshot.output,
      running: snapshot.running,
    } satisfies WorkspaceTerminalOutput);
  };

  const flushPendingResize = async () => {
    if (!ready || !lastSize) {
      return;
    }

    const nextSizeKey = getSizeKey(lastSize);
    if (lastSentSizeKey === nextSizeKey) {
      return;
    }

    await client.sendRequest("terminal.resize", {
      cols: lastSize.cols,
      rows: lastSize.rows,
      sessionId,
    });
    lastSentSizeKey = nextSizeKey;
  };

  const ensureConnected = async () => {
    if (disposed || ready) {
      return;
    }

    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = (async () => {
      await client.connect();
      const result = await client.sendRequest<TerminalSubscribeResult>("terminal.subscribe", { sessionId });
      ready = true;
      applySnapshot(result.snapshot);
      await flushPendingResize();
    })()
      .catch((error) => {
        const nextError = error instanceof Error ? error : new Error(getErrorMessage(error));
        if (!terminalExited) {
          handlers.onError(nextError);
        }
        throw nextError;
      })
      .finally(() => {
        connectPromise = null;
      });

    return connectPromise;
  };

  return {
    connect: () => {
      void ensureConnected();
    },
    dispose: () => {
      disposed = true;
      ready = false;
      client.close();
    },
    resize: async (size) => {
      if (disposed || size.cols <= 0 || size.rows <= 0) {
        return;
      }

      lastSize = size;
      await ensureConnected();
      await flushPendingResize();
    },
    send: async (input) => {
      if (disposed || !input) {
        return;
      }

      await ensureConnected();
      await client.sendRequest("terminal.send", {
        input,
        sessionId,
      });
    },
  };
}
