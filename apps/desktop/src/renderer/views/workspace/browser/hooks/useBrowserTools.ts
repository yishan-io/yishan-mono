import { useCallback, useRef, useState } from "react";
import { getErrorMessage } from "../../../../helpers/errorHelpers";

export function useBrowserTools(webviewRef: React.RefObject<Electron.WebviewTag | null>) {
  const [toolsAnchor, setToolsAnchor] = useState<HTMLElement | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const closeToolsMenu = useCallback(() => {
    setToolsAnchor(null);
  }, []);

  const notifySuccess = useCallback((message: string) => {
    setSnackbarMessage(message);
  }, []);

  const handleOpenDevTools = useCallback(() => {
    closeToolsMenu();
    webviewRef.current?.openDevTools();
  }, [webviewRef, closeToolsMenu]);

  const handleForceReload = useCallback(() => {
    closeToolsMenu();
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    const candidate = webview as unknown as { reloadIgnoringCache?: () => void };
    candidate.reloadIgnoringCache?.();
  }, [webviewRef, closeToolsMenu]);

  const handleTakeSnapshot = useCallback(async () => {
    closeToolsMenu();
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    try {
      const image = await webview.capturePage();
      const link = document.createElement("a");
      link.download = `snapshot-${Date.now()}.png`;
      link.href = image.toDataURL();
      link.click();
      notifySuccess("Snapshot saved.");
    } catch (error) {
      setErrorMessage(`Failed to take snapshot: ${getErrorMessage(error)}`);
    }
  }, [webviewRef, closeToolsMenu, notifySuccess]);

  const handleClearCache = useCallback(async () => {
    closeToolsMenu();
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    try {
      const candidate = webview as unknown as { clearCache?: () => void | Promise<void>; reload?: () => void };
      if (typeof candidate.clearCache === "function") {
        await candidate.clearCache();
      }
      candidate.reload?.();
      setErrorMessage("");
      notifySuccess("Clear Cache succeeded.");
    } catch (error) {
      setErrorMessage(`Failed to clear browser cache: ${getErrorMessage(error)}`);
    }
  }, [webviewRef, closeToolsMenu, notifySuccess]);

  const handleClearHistory = useCallback(() => {
    closeToolsMenu();
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    try {
      const candidate = webview as unknown as { clearHistory?: () => void };
      if (typeof candidate.clearHistory === "function") {
        candidate.clearHistory();
      }
      setErrorMessage("");
      notifySuccess("Clear History succeeded.");
    } catch (error) {
      setErrorMessage(`Failed to clear browser history: ${getErrorMessage(error)}`);
    }
  }, [webviewRef, closeToolsMenu, notifySuccess]);

  const handleClearCookies = useCallback(async () => {
    closeToolsMenu();
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    try {
      const candidate = webview as unknown as {
        clearStorageData?: (options?: { storages?: string[] }) => void | Promise<void>;
        reload?: () => void;
      };
      if (typeof candidate.clearStorageData === "function") {
        await candidate.clearStorageData({ storages: ["cookies"] });
      }
      candidate.reload?.();
      setErrorMessage("");
      notifySuccess("Clear Cookies succeeded.");
    } catch (error) {
      setErrorMessage(`Failed to clear browser cookies: ${getErrorMessage(error)}`);
    }
  }, [webviewRef, closeToolsMenu, notifySuccess]);

  const handleClearAllData = useCallback(async () => {
    closeToolsMenu();
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    try {
      const candidate = webview as unknown as {
        clearHistory?: () => void;
        clearStorageData?: (options?: { storages?: string[] }) => void | Promise<void>;
        clearCache?: () => void | Promise<void>;
        reload?: () => void;
      };
      candidate.clearHistory?.();
      if (typeof candidate.clearStorageData === "function") {
        await candidate.clearStorageData();
      }
      if (typeof candidate.clearCache === "function") {
        await candidate.clearCache();
      }
      candidate.reload?.();
      setErrorMessage("");
      notifySuccess("Clear All Data succeeded.");
    } catch (error) {
      setErrorMessage(`Failed to clear browser data: ${getErrorMessage(error)}`);
    }
  }, [webviewRef, closeToolsMenu, notifySuccess]);

  return {
    toolsAnchor,
    setToolsAnchor,
    errorMessage,
    setErrorMessage,
    snackbarMessage,
    setSnackbarMessage,
    closeToolsMenu,
    handleOpenDevTools,
    handleForceReload,
    handleTakeSnapshot,
    handleClearCache,
    handleClearHistory,
    handleClearCookies,
    handleClearAllData,
  };
}
