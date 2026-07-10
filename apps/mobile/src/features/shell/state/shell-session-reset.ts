import { resetShellSessionState } from "@/features/shell/state/shellSessionStore";
import { clearStoredShellState, clearStoredTerminalRuntimeState } from "@/lib/storage/shell-state-storage";

/**
 * Clears in-memory shell session state together with persisted shell storage.
 */
export async function resetShellStoredStateRuntime() {
  resetShellSessionState();
  await Promise.all([clearStoredShellState(), clearStoredTerminalRuntimeState()]);
}
