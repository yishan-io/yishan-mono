import { useCallback, useEffect, useRef, useState } from "react";
import { useCommands } from "../../../../hooks/useCommands";

export function useWebviewEvents(args: {
  tabId: string;
  resolvedUrl: string;
  pageTitle: string;
  addHistoryEntry: (url: string, title: string, faviconUrl?: string) => void;
  setPageTitle: (title: string) => void;
  onNavigated?: (url: string) => void;
}) {
  const { tabId, resolvedUrl, pageTitle, addHistoryEntry, setPageTitle, onNavigated } = args;
  const cmd = useCommands();
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const isWebviewReadyRef = useRef(false);
  const pageTitleRef = useRef(pageTitle);
  const onNavigatedRef = useRef(onNavigated);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isWebviewReady, setIsWebviewReady] = useState(false);

  pageTitleRef.current = pageTitle;
  onNavigatedRef.current = onNavigated;

  useEffect(() => {
    void resolvedUrl;
    isWebviewReadyRef.current = false;
    setIsWebviewReady(false);
    setCanGoBack(false);
    setCanGoForward(false);
  }, [resolvedUrl]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const handlePageTitleUpdated = (event: Event) => {
      const nextTitle = (event as { title?: string }).title?.trim();
      if (!nextTitle) {
        return;
      }
      setPageTitle(nextTitle);
      const currentUrl = webview.getURL?.() || resolvedUrl;
      addHistoryEntry(currentUrl, nextTitle);
      cmd.renameTab(tabId, nextTitle);
    };

    const handleFaviconUpdated = (event: Event) => {
      const favicons = (event as { favicons?: string[] }).favicons;
      const faviconUrl = favicons?.[0];
      cmd.setBrowserTabFaviconUrl(tabId, faviconUrl);
      if (faviconUrl) {
        const currentUrl = webview.getURL?.() || resolvedUrl;
        addHistoryEntry(currentUrl, pageTitleRef.current, faviconUrl);
      }
    };

    const updateNavigationState = () => {
      if (!isWebviewReadyRef.current) {
        setCanGoBack(false);
        setCanGoForward(false);
        return;
      }
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    // Persist the webview's committed URL to the tab store only after
    // navigation fully completes, avoiding mid-load store writes that
    // could trigger a React re-render and abort the in-flight load.
    const persistNavigatedUrl = () => {
      try {
        const currentUrl = webview.getURL?.();
        if (currentUrl && onNavigatedRef.current) {
          onNavigatedRef.current(currentUrl);
        }
      } catch {
        // Webview may not be attached; ignore.
      }
    };

    const handleDomReady = () => {
      isWebviewReadyRef.current = true;
      setIsWebviewReady(true);
      updateNavigationState();
      persistNavigatedUrl();
    };

    const handleDidNavigate = () => {
      updateNavigationState();
      persistNavigatedUrl();
    };

    const handleDidStartLoading = () => {
      updateNavigationState();
    };

    const handleDidStopLoading = () => {
      updateNavigationState();
    };

    webview.addEventListener("page-title-updated", handlePageTitleUpdated);
    webview.addEventListener("page-favicon-updated", handleFaviconUpdated);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigate);
    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);
    updateNavigationState();

    return () => {
      isWebviewReadyRef.current = false;
      webview.removeEventListener("page-title-updated", handlePageTitleUpdated);
      webview.removeEventListener("page-favicon-updated", handleFaviconUpdated);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener("did-navigate-in-page", handleDidNavigate);
      webview.removeEventListener("did-start-loading", handleDidStartLoading);
      webview.removeEventListener("did-stop-loading", handleDidStopLoading);
    };
  }, [cmd, tabId, resolvedUrl, addHistoryEntry, setPageTitle]);

  const setWebviewRef = useCallback((element: Electron.WebviewTag | null) => {
    webviewRef.current = element;
  }, []);

  return { webviewRef, setWebviewRef, canGoBack, canGoForward, isWebviewReady };
}
