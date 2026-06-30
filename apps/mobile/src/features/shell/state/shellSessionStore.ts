import { useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  ShellSelection,
  ShellWorkspaceTabState,
  TerminalItem,
  WorkspacePaneLayoutState,
} from "@/features/shell/state/shell.types";

export type ShellSessionState = {
  hasRestoredStoredState: boolean;
  paneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  selectedNodeIdByOrganization: Record<string, string>;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  workspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
};

let currentRestorePromise: Promise<void> | null = null;

function createInitialShellSessionState(): ShellSessionState {
  return {
    hasRestoredStoredState: false,
    paneLayoutByWorkspaceId: {},
    selectedNodeIdByOrganization: {},
    terminalsByWorkspaceId: {},
    workspaceTabStateByWorkspaceId: {},
  };
}

let currentState = createInitialShellSessionState();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentState;
}

function resolveStateUpdate<T>(current: T, next: SetStateAction<T>): T {
  return typeof next === "function" ? (next as (value: T) => T)(current) : next;
}

function updateStateField<Key extends keyof ShellSessionState>(
  key: Key,
  nextValue: SetStateAction<ShellSessionState[Key]>,
) {
  const resolvedValue = resolveStateUpdate(currentState[key], nextValue);
  if (Object.is(currentState[key], resolvedValue)) {
    return;
  }

  currentState = {
    ...currentState,
    [key]: resolvedValue,
  };
  emit();
}

export const setShellSessionHasRestoredStoredState: Dispatch<SetStateAction<boolean>> = (nextValue) => {
  updateStateField("hasRestoredStoredState", nextValue);
};

export const setShellSessionPaneLayoutByWorkspaceId: Dispatch<
  SetStateAction<Record<string, WorkspacePaneLayoutState>>
> = (nextValue) => {
  updateStateField("paneLayoutByWorkspaceId", nextValue);
};

export const setShellSessionSelectedNodeIdByOrganization: Dispatch<SetStateAction<Record<string, string>>> = (
  nextValue,
) => {
  updateStateField("selectedNodeIdByOrganization", nextValue);
};

export const setShellSessionTerminalsByWorkspaceId: Dispatch<SetStateAction<Record<string, TerminalItem[]>>> = (
  nextValue,
) => {
  updateStateField("terminalsByWorkspaceId", nextValue);
};

export const setShellSessionWorkspaceTabStateByWorkspaceId: Dispatch<
  SetStateAction<Record<string, ShellWorkspaceTabState>>
> = (nextValue) => {
  updateStateField("workspaceTabStateByWorkspaceId", nextValue);
};

export function useShellSessionState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Returns the in-flight shell restore promise when a restore is already running.
 */
export function getShellSessionRestorePromise() {
  return currentRestorePromise;
}

/**
 * Updates the in-flight shell restore promise sentinel.
 */
export function setShellSessionRestorePromise(nextPromise: Promise<void> | null) {
  currentRestorePromise = nextPromise;
}

/**
 * Returns the current module-level shell session snapshot.
 */
export function getShellSessionStateSnapshot() {
  return currentState;
}

/**
 * Resets all module-level shell session runtime state.
 */
export function resetShellSessionState() {
  currentState = createInitialShellSessionState();
  currentRestorePromise = null;
  emit();
}

/**
 * Test helper that clears all module-level shell session runtime state.
 */
export function resetShellSessionStateForTests() {
  resetShellSessionState();
}
