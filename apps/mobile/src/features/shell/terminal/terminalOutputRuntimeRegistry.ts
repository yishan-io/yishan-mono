import {
  type TerminalWriteRuntime,
  appendTerminalChunk,
  resetTerminalFromCache,
} from "../components/shell-terminal-dom-emulator-runtime";
import { trimTerminalOutputForCache } from "../state/terminal-output";

const MAX_CACHED_TERMINAL_OUTPUT_LENGTH = 250000;
const OUTPUT_FLUSH_INTERVAL_MS = 16;

type TerminalOutputRuntimeEntry = {
  mountedTerminal: TerminalWriteRuntime | null;
  output: string;
  pendingAppend: string;
  pendingReplace: string | null;
  flushTimeout: ReturnType<typeof setTimeout> | null;
};

const runtimeByTerminalId = new Map<string, TerminalOutputRuntimeEntry>();

function ensureTerminalOutputRuntimeEntry(terminalId: string): TerminalOutputRuntimeEntry {
  const existing = runtimeByTerminalId.get(terminalId);
  if (existing) {
    return existing;
  }

  const created: TerminalOutputRuntimeEntry = {
    flushTimeout: null,
    mountedTerminal: null,
    output: "",
    pendingAppend: "",
    pendingReplace: null,
  };
  runtimeByTerminalId.set(terminalId, created);
  return created;
}

function trimOutput(text: string): string {
  return trimTerminalOutputForCache(text, MAX_CACHED_TERMINAL_OUTPUT_LENGTH);
}

function clearPendingFlush(entry: TerminalOutputRuntimeEntry) {
  if (!entry.flushTimeout) {
    return;
  }

  clearTimeout(entry.flushTimeout);
  entry.flushTimeout = null;
}

function flushTerminalOutput(terminalId: string) {
  const entry = runtimeByTerminalId.get(terminalId);
  if (!entry) {
    return;
  }

  entry.flushTimeout = null;
  const mountedTerminal = entry.mountedTerminal;
  if (!mountedTerminal) {
    entry.pendingAppend = "";
    entry.pendingReplace = null;
    return;
  }

  if (entry.pendingReplace !== null) {
    resetTerminalFromCache(mountedTerminal, entry.pendingReplace);
    entry.pendingReplace = null;
    entry.pendingAppend = "";
    return;
  }

  if (!entry.pendingAppend) {
    return;
  }

  appendTerminalChunk(mountedTerminal, entry.pendingAppend);
  entry.pendingAppend = "";
}

function scheduleFlush(terminalId: string, entry: TerminalOutputRuntimeEntry) {
  if (!entry.mountedTerminal || entry.flushTimeout) {
    return;
  }

  entry.flushTimeout = setTimeout(() => {
    flushTerminalOutput(terminalId);
  }, OUTPUT_FLUSH_INTERVAL_MS);
}

export function readTerminalOutputRuntimeSnapshot(terminalId: string, fallbackOutput = ""): string {
  const entry = runtimeByTerminalId.get(terminalId);
  if (entry) {
    return entry.output;
  }

  return fallbackOutput;
}

export function replaceTerminalOutputRuntime(terminalId: string, output: string) {
  const entry = ensureTerminalOutputRuntimeEntry(terminalId);
  entry.output = trimOutput(output);

  if (!entry.mountedTerminal) {
    return;
  }

  entry.pendingReplace = entry.output;
  entry.pendingAppend = "";
  scheduleFlush(terminalId, entry);
}

export function appendTerminalOutputRuntime(terminalId: string, chunk: string, fallbackOutput = "") {
  if (!chunk) {
    return;
  }

  const entry = ensureTerminalOutputRuntimeEntry(terminalId);
  const previousOutput = entry.output || fallbackOutput;
  const nextOutput = trimOutput(previousOutput + chunk);
  const canAppend = nextOutput.startsWith(previousOutput);

  entry.output = nextOutput;

  if (!entry.mountedTerminal) {
    return;
  }

  if (!canAppend) {
    entry.pendingReplace = nextOutput;
    entry.pendingAppend = "";
    scheduleFlush(terminalId, entry);
    return;
  }

  const appendedText = nextOutput.slice(previousOutput.length);
  if (!appendedText) {
    return;
  }

  if (entry.pendingReplace !== null) {
    entry.pendingReplace = nextOutput;
  } else {
    entry.pendingAppend += appendedText;
  }
  scheduleFlush(terminalId, entry);
}

export function clearTerminalOutputRuntime(terminalId: string) {
  const entry = runtimeByTerminalId.get(terminalId);
  if (!entry) {
    return;
  }

  entry.output = "";
  if (!entry.mountedTerminal) {
    entry.pendingAppend = "";
    entry.pendingReplace = null;
    return;
  }

  entry.pendingReplace = "";
  entry.pendingAppend = "";
  scheduleFlush(terminalId, entry);
}

export function mountTerminalOutputRuntime(input: {
  fallbackOutput?: string;
  terminal: TerminalWriteRuntime;
  terminalId: string;
}) {
  const entry = ensureTerminalOutputRuntimeEntry(input.terminalId);
  if (!entry.output && input.fallbackOutput) {
    entry.output = trimOutput(input.fallbackOutput);
  }

  clearPendingFlush(entry);
  entry.mountedTerminal = input.terminal;
  entry.pendingAppend = "";
  entry.pendingReplace = null;
  resetTerminalFromCache(input.terminal, entry.output);
}

export function unmountTerminalOutputRuntime(input: {
  terminal: TerminalWriteRuntime;
  terminalId: string;
}) {
  const entry = runtimeByTerminalId.get(input.terminalId);
  if (!entry || entry.mountedTerminal !== input.terminal) {
    return;
  }

  clearPendingFlush(entry);
  entry.mountedTerminal = null;
  entry.pendingAppend = "";
  entry.pendingReplace = null;
}

export function deleteTerminalOutputRuntime(terminalId: string) {
  const entry = runtimeByTerminalId.get(terminalId);
  if (!entry) {
    return;
  }

  clearPendingFlush(entry);
  runtimeByTerminalId.delete(terminalId);
}

export function listTerminalOutputRuntimeIds(): string[] {
  return [...runtimeByTerminalId.keys()];
}
