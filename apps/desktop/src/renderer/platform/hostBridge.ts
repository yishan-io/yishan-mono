import type { DesktopBridge, DesktopHostBridge } from "../../main/bridge/desktopBridge";

/**
 * Desktop host bridge access (desktop7 Phase 27).
 *
 * The Electron preload bridge (main-process IPC surface) is not daemon RPC;
 * it lives here so root RPC keeps only connection/wire/subscription code and
 * callers never import transport just for the bridge. Dependency rule: this
 * module may import `main/bridge/desktopBridge` types only.
 */

/** Returns one preload-provided desktop bridge object when available. */
export function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as typeof window & { __YISHAN__?: DesktopBridge }).__YISHAN__;
}

/** Returns one preload-provided desktop host bridge for shell-only capabilities. */
export function getDesktopHostBridge(): DesktopHostBridge {
  const host = getDesktopBridge()?.host;
  if (!host) {
    throw new Error("Desktop host bridge is unavailable.");
  }

  return host;
}
