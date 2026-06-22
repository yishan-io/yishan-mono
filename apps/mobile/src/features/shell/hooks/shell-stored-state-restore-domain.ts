export function shouldStartShellStoredStateRestore(input: {
  hasActiveRestorePromise: boolean;
  hasRestoredStoredState: boolean;
}) {
  return !input.hasActiveRestorePromise && !input.hasRestoredStoredState;
}
