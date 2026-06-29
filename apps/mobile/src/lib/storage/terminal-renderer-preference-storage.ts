import { getStoredValue, setStoredValue } from "@/lib/storage/key-value-storage";

export type TerminalRendererPreference = "native" | "xterm";

const TERMINAL_RENDERER_PREFERENCE_KEY = "yishan.mobile.terminal-renderer-preference";
const DEFAULT_TERMINAL_RENDERER_PREFERENCE: TerminalRendererPreference = "xterm";

function isTerminalRendererPreference(value: string | null): value is TerminalRendererPreference {
  return value === "native" || value === "xterm";
}

/** Loads the persisted terminal renderer preference for the mobile shell. */
export async function loadTerminalRendererPreference(): Promise<TerminalRendererPreference> {
  const storedValue = await getStoredValue(TERMINAL_RENDERER_PREFERENCE_KEY);
  return isTerminalRendererPreference(storedValue) ? storedValue : DEFAULT_TERMINAL_RENDERER_PREFERENCE;
}

/** Persists the terminal renderer preference for the mobile shell. */
export async function saveTerminalRendererPreference(preference: TerminalRendererPreference): Promise<void> {
  await setStoredValue(TERMINAL_RENDERER_PREFERENCE_KEY, preference);
}
