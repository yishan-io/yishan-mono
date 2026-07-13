import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Installs Pi lifecycle hooks that forward events to the Yishan daemon
 * via the notify script specified in YISHAN_NOTIFY_SCRIPT_PATH.
 *
 * Only activates in Yishan-managed terminals (detected via
 * YISHAN_TERMINAL_ID, YISHAN_TAB_ID, or YISHAN_PANE_ID).
 */
export function createPiNotifyExtension(pi: ExtensionAPI): void {
  const notifyPath = process.env.YISHAN_NOTIFY_SCRIPT_PATH;
  if (!notifyPath) return;

  const isWindows = process.platform === "win32";
  const command = isWindows ? "powershell.exe" : "bash";
  const argPrefix: string[] = isWindows
    ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", notifyPath, "--agent", "pi", "--event"]
    : [notifyPath, "--agent", "pi", "--event"];

  const isManagedTerminal = Boolean(
    process.env.YISHAN_TERMINAL_ID || process.env.YISHAN_TAB_ID || process.env.YISHAN_PANE_ID,
  );
  if (!isManagedTerminal) return;

  const fire = (eventName: string) => {
    try {
      const args = [...argPrefix, eventName];
      const child = spawn(command, args, {
        stdio: ["ignore", "ignore", "ignore"],
        detached: true,
        env: process.env,
      });
      child.on("error", () => {});
      child.unref();
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
