import { getDesktopHostBridge } from "@renderer/rpc/rpcTransport";
import { useCallback, useEffect, useRef, useState } from "react";

/** Manages loading and saving the daemon quit-on-exit setting. */
export function useQuitOnExitSetting() {
  const [quitOnExit, setQuitOnExitValue] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isMountedRef = useRef(true);

  const loadQuitOnExit = useCallback(async () => {
    try {
      const value = await getDesktopHostBridge().getDaemonQuitOnExit();
      if (!isMountedRef.current) {
        return;
      }
      setQuitOnExitValue(value);
    } catch (error) {
      console.error("[DaemonSettingsView] Failed to load quit-on-exit setting", error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadQuitOnExit();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadQuitOnExit]);

  const setQuitOnExit = useCallback(async (nextChecked: boolean) => {
    setQuitOnExitValue(nextChecked);
    setIsSaving(true);
    try {
      await getDesktopHostBridge().setDaemonQuitOnExit(nextChecked);
    } catch (error) {
      console.error("[DaemonSettingsView] Failed to save quit-on-exit setting", error);
      if (isMountedRef.current) {
        setQuitOnExitValue(!nextChecked);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, []);

  return {
    isLoading,
    isSaving,
    quitOnExit,
    setQuitOnExit,
  };
}
