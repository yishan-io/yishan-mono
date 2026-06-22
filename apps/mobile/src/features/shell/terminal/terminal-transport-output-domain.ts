import type { TerminalItem } from "../state/shell.types";
import { sanitizeTerminalDisplayOutput, trimTerminalOutputForCache } from "../state/terminal-output";

const MAX_CACHED_TERMINAL_OUTPUT_LENGTH = 250000;
const MIN_DEDUPLICATION_OVERLAP = 24;

function findReplayOverlap(previousOutput: string, nextChunk: string): number {
  const maxOverlap = Math.min(previousOutput.length, nextChunk.length);
  for (let overlap = maxOverlap; overlap >= MIN_DEDUPLICATION_OVERLAP; overlap -= 1) {
    if (previousOutput.slice(-overlap) === nextChunk.slice(0, overlap)) {
      return overlap;
    }
  }

  return 0;
}

function mergeTerminalOutput(previousOutput: string, nextChunk: string): string {
  if (!nextChunk) {
    return previousOutput;
  }

  if (nextChunk.length >= MIN_DEDUPLICATION_OVERLAP && previousOutput.endsWith(nextChunk)) {
    return previousOutput;
  }

  const overlap = findReplayOverlap(previousOutput, nextChunk);
  return overlap > 0 ? previousOutput + nextChunk.slice(overlap) : previousOutput + nextChunk;
}

export function buildTrimmedTerminalOutput(previousOutput: string, nextChunk: string, replace?: boolean) {
  return trimTerminalOutputForCache(
    replace ? nextChunk : mergeTerminalOutput(previousOutput, nextChunk),
    MAX_CACHED_TERMINAL_OUTPUT_LENGTH,
  );
}

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
