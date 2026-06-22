import { buildShellTerminalLaunchCommand } from "../state/shell-agent-presets";
import type { TerminalItem } from "../state/shell.types";
import type { RuntimeSnapshot, TerminalMeasuredSize } from "./terminal-transport-controller-domain";

const terminalSessionStartLeaseByTerminalId = new Map<string, string | null>();

/**
 * Keeps mobile-created terminal sessions scoped to one workspace pane.
 */
export function resolveMobileTerminalPaneId(workspaceId: string) {
  return `pane-${workspaceId}`;
}

/**
 * Builds the terminal-session start payload used by mobile shell tabs.
 */
export function buildStartWorkspaceTerminalInput(
  workspaceId: string,
  terminalId: string,
  size?: TerminalMeasuredSize | null,
) {
  return size
    ? {
        cols: size.cols,
        paneId: resolveMobileTerminalPaneId(workspaceId),
        rows: size.rows,
        tabId: terminalId,
      }
    : {
        paneId: resolveMobileTerminalPaneId(workspaceId),
        tabId: terminalId,
      };
}

/**
 * Builds the minimum local session summary before list hydration completes.
 */
export function buildStartedTerminalSessionSummary(workspaceId: string, sessionId: string): TerminalItem["session"] {
  return {
    sessionId,
    status: "running",
    workspaceId,
  };
}

/**
 * Guards terminal startup so stale resize/effect callbacks cannot create a
 * second backend session after one terminal has already been bound.
 */
export function shouldSkipTerminalSessionStart(args: {
  existingSessionId?: string | null;
  snapshot: Pick<RuntimeSnapshot, "ensuredSessionId" | "starting">;
}) {
  return Boolean(args.snapshot.starting || args.snapshot.ensuredSessionId || args.existingSessionId);
}

/**
 * Tries to claim the single start lease for one terminal id.
 */
export function tryClaimTerminalSessionStartLease(terminalId: string) {
  if (terminalSessionStartLeaseByTerminalId.has(terminalId)) {
    return false;
  }

  terminalSessionStartLeaseByTerminalId.set(terminalId, null);
  return true;
}

/**
 * Marks one terminal id as having an active backend session binding.
 */
export function bindTerminalSessionStartLease(terminalId: string, sessionId: string) {
  terminalSessionStartLeaseByTerminalId.set(terminalId, sessionId);
}

/**
 * Releases a temporary in-flight start lease when startup fails or aborts
 * before a session is bound.
 */
export function releaseTerminalSessionStartLease(terminalId: string) {
  const sessionId = terminalSessionStartLeaseByTerminalId.get(terminalId);
  if (sessionId) {
    return;
  }

  terminalSessionStartLeaseByTerminalId.delete(terminalId);
}

/**
 * Clears any terminal start/session lease so the same terminal id can bind a
 * replacement backend session after an explicit reset.
 */
export function resetTerminalSessionStartLease(terminalId: string) {
  terminalSessionStartLeaseByTerminalId.delete(terminalId);
}

/**
 * Builds the terminal input used to launch an agent after session startup.
 */
export function buildTerminalLaunchInput(terminal: Pick<TerminalItem, "agentKind" | "launchCommand">): string | null {
  const launchCommand = terminal.launchCommand?.trim();
  if (!launchCommand) {
    return null;
  }

  return `${buildShellTerminalLaunchCommand(launchCommand, Boolean(terminal.agentKind))}\r`;
}

/**
 * Resets all transient runtime flags for a terminal snapshot.
 */
export function resetTerminalRuntimeSnapshot(snapshot: RuntimeSnapshot) {
  snapshot.ensuredSessionId = null;
  snapshot.exited = false;
  snapshot.ensuring = false;
  snapshot.starting = false;
  snapshot.transportSessionId = null;
}
