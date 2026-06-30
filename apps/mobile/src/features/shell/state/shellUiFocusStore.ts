import { useSyncExternalStore } from "react";

type ShellUiFocusState = {
  hasBlockingOverlay: boolean;
  isDrawerOpen: boolean;
  isPaneTabSheetOpen: boolean;
};

const defaultState: ShellUiFocusState = {
  hasBlockingOverlay: false,
  isDrawerOpen: false,
  isPaneTabSheetOpen: false,
};

let currentState: ShellUiFocusState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function statesEqual(a: ShellUiFocusState, b: ShellUiFocusState) {
  return (
    a.hasBlockingOverlay === b.hasBlockingOverlay &&
    a.isDrawerOpen === b.isDrawerOpen &&
    a.isPaneTabSheetOpen === b.isPaneTabSheetOpen
  );
}

export function setShellUiFocusState(nextState: ShellUiFocusState) {
  if (statesEqual(currentState, nextState)) {
    return;
  }

  currentState = nextState;
  emit();
}

export function resetShellUiFocusState() {
  setShellUiFocusState(defaultState);
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

export function useShellUiFocusState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
