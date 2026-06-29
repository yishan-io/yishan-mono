import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  type TerminalRendererPreference,
  loadTerminalRendererPreference,
  saveTerminalRendererPreference,
} from "@/lib/storage/terminal-renderer-preference-storage";

type AppTerminalRendererContextValue = {
  preference: TerminalRendererPreference;
  setPreference: (preference: TerminalRendererPreference) => Promise<void>;
};

const AppTerminalRendererContext = createContext<AppTerminalRendererContextValue | null>(null);

/** Owns terminal renderer preference restore and persistence for the mobile shell. */
export function AppTerminalRendererProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<TerminalRendererPreference>("xterm");

  useEffect(() => {
    let cancelled = false;

    void loadTerminalRendererPreference().then((storedPreference) => {
      if (!cancelled) {
        setPreferenceState(storedPreference);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: TerminalRendererPreference) => {
    setPreferenceState(nextPreference);
    await saveTerminalRendererPreference(nextPreference);
  }, []);

  const value = useMemo<AppTerminalRendererContextValue>(
    () => ({
      preference,
      setPreference,
    }),
    [preference, setPreference],
  );

  return <AppTerminalRendererContext.Provider value={value}>{children}</AppTerminalRendererContext.Provider>;
}

/** Reads the persisted terminal renderer preference for settings and shell surfaces. */
export function useAppTerminalRenderer(): AppTerminalRendererContextValue {
  const value = useContext(AppTerminalRendererContext);
  if (!value) {
    throw new Error("useAppTerminalRenderer must be used inside AppTerminalRendererProvider");
  }

  return value;
}
