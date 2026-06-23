import type { TerminalItem } from "../state/shell.types";
import { sanitizeTerminalDisplayOutput } from "../state/terminal-output";

export function buildExitedTerminalRuntimePatch(terminal: TerminalItem, output: string) {
  const renderedOutput = sanitizeTerminalDisplayOutput(output);
  return {
    cachedOutput: output,
    lastMessagePreview: renderedOutput.trim().slice(-240) || terminal.lastMessagePreview || null,
    session: terminal.session
      ? {
          ...terminal.session,
          status: "exited" as const,
        }
      : terminal.session,
    status: "idle" as const,
  };
}

export function mergePendingTerminalOutputMap(
  current: Record<string, string>,
  pending: Record<string, string>,
): Record<string, string> {
  let changed = false;
  const next = { ...current };

  for (const [terminalId, output] of Object.entries(pending)) {
    if (next[terminalId] === output) {
      continue;
    }

    next[terminalId] = output;
    changed = true;
  }

  return changed ? next : current;
}
