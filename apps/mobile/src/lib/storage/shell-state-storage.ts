import type { TerminalItem } from "@/features/shell/state/shell.types";
import { deleteStoredValue, getStoredValue, setStoredValue } from "@/lib/storage/key-value-storage";

import {
  MAX_PERSISTED_TERMINALS_PER_WORKSPACE,
  type StoredShellState,
  type StoredTerminalRuntimeState,
  compactTerminalRuntime,
  toPersistedShellState,
} from "./shell-state-storage-domain";
import { parseStoredShellState, parseStoredTerminalRuntimeState } from "./shell-state-storage-parse";

const SHELL_STATE_KEY = "yishan.mobile.shell-state";
const SHELL_TERMINAL_RUNTIME_KEY = "yishan.mobile.shell-terminal-runtime";

export type {
  StoredShellState,
  StoredTerminalRuntimeItem,
  StoredTerminalRuntimeState,
} from "./shell-state-storage-domain";

export async function loadStoredShellState(): Promise<StoredShellState | null> {
  const raw = await getStoredValue(SHELL_STATE_KEY);
  return raw ? parseStoredShellState(raw) : null;
}

export async function saveStoredShellState(state: StoredShellState): Promise<void> {
  try {
    await setStoredValue(SHELL_STATE_KEY, JSON.stringify(toPersistedShellState(state)));
  } catch {
    // Ignore storage failures so shell interactions continue even if persistence is unavailable.
  }
}

export async function clearStoredShellState(): Promise<void> {
  try {
    await deleteStoredValue(SHELL_STATE_KEY);
  } catch {
    // Ignore storage failures so sign-out and shell reset still proceed.
  }
}

export async function loadStoredTerminalRuntimeState(): Promise<StoredTerminalRuntimeState> {
  const raw = await getStoredValue(SHELL_TERMINAL_RUNTIME_KEY);
  return raw ? parseStoredTerminalRuntimeState(raw) : {};
}

export async function saveStoredTerminalRuntimeState(
  terminalsByWorkspaceId: Record<string, TerminalItem[]>,
): Promise<void> {
  try {
    const runtimeState: StoredTerminalRuntimeState = Object.fromEntries(
      Object.entries(terminalsByWorkspaceId).map(([workspaceId, terminals]) => [
        workspaceId,
        terminals.slice(0, MAX_PERSISTED_TERMINALS_PER_WORKSPACE).map(compactTerminalRuntime),
      ]),
    );

    await setStoredValue(SHELL_TERMINAL_RUNTIME_KEY, JSON.stringify(runtimeState));
  } catch {
    // Ignore storage failures so terminal interactions continue even if runtime persistence is unavailable.
  }
}

export async function clearStoredTerminalRuntimeState(): Promise<void> {
  try {
    await deleteStoredValue(SHELL_TERMINAL_RUNTIME_KEY);
  } catch {
    // Ignore storage failures so sign-out and shell reset still proceed.
  }
}
