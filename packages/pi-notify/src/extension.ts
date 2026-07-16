import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface DaemonEventPayload {
  agent: string;
  rawEventType: string;
  ts: number;
  workspaceId: string;
  tabId: string;
  paneId: string;
  payload: Record<string, never>;
}

/**
 * Installs Pi lifecycle hooks that forward events to the Yishan daemon via
 * direct HTTP POST to the daemon's hook ingress endpoint
 * (YISHAN_HOOK_INGRESS_URL).
 *
 * Only activates in Yishan-managed terminals (detected via
 * YISHAN_TERMINAL_ID, YISHAN_TAB_ID, or YISHAN_PANE_ID).
 */
export function createPiNotifyExtension(pi: ExtensionAPI): void {
  const daemonUrl = process.env.YISHAN_HOOK_INGRESS_URL;
  if (!daemonUrl) return;

  const isManagedTerminal = Boolean(
    process.env.YISHAN_TERMINAL_ID || process.env.YISHAN_TAB_ID || process.env.YISHAN_PANE_ID,
  );
  if (!isManagedTerminal) return;

  const fire = (eventName: string) => {
    try {
      const body: DaemonEventPayload = {
        agent: "pi",
        rawEventType: eventName,
        ts: Date.now(),
        workspaceId: process.env.YISHAN_WORKSPACE_ID ?? "",
        tabId: process.env.YISHAN_TAB_ID ?? "",
        paneId: process.env.YISHAN_PANE_ID ?? "",
        payload: {},
      };

      // fire-and-forget: never block the agent on notification failure
      fetch(daemonUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch {
      // fire-and-forget: never block the agent on notification failure
    }
  };

  const skip = (ctx: { hasUI?: boolean }) => ctx?.hasUI === false;

  let currentState: "idle" | "busy" = "idle";

  pi.on("agent_start", (_event: unknown, ctx: { hasUI?: boolean }) => {
    if (skip(ctx)) return;
    if (currentState === "idle") {
      currentState = "busy";
      fire("Start");
    }
  });

  pi.on("tool_execution_end", (_event: unknown, ctx: { hasUI?: boolean }) => {
    if (skip(ctx)) return;
    fire("PostToolUse");
  });

  pi.on("agent_settled", (_event: unknown, ctx: { hasUI?: boolean }) => {
    if (skip(ctx)) return;
    if (currentState === "busy") {
      currentState = "idle";
      fire("Stop");
    }
  });

  pi.on("session_shutdown", (_event: unknown, ctx: { hasUI?: boolean }) => {
    if (skip(ctx)) return;
    if (currentState === "busy") {
      currentState = "idle";
      fire("Stop");
    }
  });
}
