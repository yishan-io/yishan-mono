import type { AuthStatus } from "@/features/auth";
import type { TerminalItem } from "../state/shell.types";

export type TerminalRuntimeSelectedAction =
  | { kind: "none" }
  | { kind: "attach-or-create"; terminal: TerminalItem }
  | { kind: "connect-transport"; sessionId: string; terminal: TerminalItem }
  | { kind: "schedule-start"; terminal: TerminalItem };

export function resolveSelectedTerminalRuntimeAction(args: {
  accessToken: string | null;
  getRuntimeSnapshot: (terminalId: string) => { ensuredSessionId: string | null };
  selectedTerminalId: string | null;
  status: AuthStatus;
  terminalsById: Record<string, TerminalItem>;
}): TerminalRuntimeSelectedAction {
  const { accessToken, getRuntimeSnapshot, selectedTerminalId, status, terminalsById } = args;
  if (!selectedTerminalId || status !== "authenticated" || !accessToken) {
    return { kind: "none" };
  }

  const terminal = terminalsById[selectedTerminalId];
  if (!terminal) {
    return { kind: "none" };
  }

  const sessionId = terminal.session?.sessionId;
  if (sessionId) {
    const snapshot = getRuntimeSnapshot(terminal.id);
    if (snapshot.ensuredSessionId !== sessionId) {
      return { kind: "attach-or-create", terminal };
    }

    if (terminal.status === "running" || terminal.status === "waiting_input" || terminal.status === "error") {
      return { kind: "connect-transport", sessionId, terminal };
    }

    return { kind: "none" };
  }

  if (terminal.status === "initializing") {
    return { kind: "schedule-start", terminal };
  }

  return { kind: "none" };
}

export function classifyTerminalRuntimeCleanup(args: {
  existingTerminalIds: Set<string>;
  runtimeTerminalIds: string[];
}) {
  const staleTerminalIds: string[] = [];

  for (const terminalId of args.runtimeTerminalIds) {
    if (!args.existingTerminalIds.has(terminalId)) {
      staleTerminalIds.push(terminalId);
    }
  }

  return {
    staleTerminalIds,
  };
}
