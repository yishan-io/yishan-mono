import { Box } from "@mui/material";
import { type FormEvent, useCallback, useMemo, useRef } from "react";
import { LuWrench } from "react-icons/lu";
import { useCommands } from "../../../hooks/useCommands";
import { tabStore } from "../../../store/tabStore";
import { BlankView } from "./BlankView";
import { ToolsMenu } from "./ToolsMenu";
import { UrlBar } from "./UrlBar";
import { WebviewPane } from "./WebviewPane";
import { useBrowserHistory } from "./hooks/useBrowserHistory";
import { useBrowserTools } from "./hooks/useBrowserTools";
import { useBrowserUrl } from "./hooks/useBrowserUrl";
import { useElementInspector } from "./hooks/useElementInspector";
import { useWebviewEvents } from "./hooks/useWebviewEvents";
import { normalizeUrl } from "./normalizeUrl";

type BrowserViewProps = {
  tabId: string;
  initialUrl: string;
};

export function BrowserView({ tabId, initialUrl }: BrowserViewProps) {
  const cmd = useCommands();
  const textFieldRef = useRef<HTMLDivElement>(null);

  const { historyGroups, addHistoryEntry, filterHistory } = useBrowserHistory();

  const url = useBrowserUrl(initialUrl);
  const {
    urlInput,
    setUrlInput,
    setActiveUrl,
    urlFocused,
    highlightIndex,
    setHighlightIndex,
    displayUrl,
    isHttps,
    isHttp,
    resolvedUrl,
    pageTitle,
    setPageTitle,
    handleUrlFocus,
    handleUrlBlur,
    resetForNavigation,
  } = url;

  const filteredHistory = useMemo(() => filterHistory(urlInput, urlFocused), [filterHistory, urlInput, urlFocused]);

  const handleNavigated = useCallback(
    (url: string) => {
      setUrlInput(url);
      tabStore.getState().setBrowserTabUrl(tabId, url);
    },
    [tabId, setUrlInput],
  );

  const { webviewRef, setWebviewRef, canGoBack, canGoForward } = useWebviewEvents({
    tabId,
    resolvedUrl,
    pageTitle,
    addHistoryEntry,
    setPageTitle,
    onNavigated: handleNavigated,
  });

  const tools = useBrowserTools(webviewRef);
  const inspector = useElementInspector(webviewRef);

  const snackbarMessage = tools.snackbarMessage;
  const clearSnackbarMessage = useCallback(() => {
    tools.setSnackbarMessage("");
  }, [tools]);

  const navigateTo = useCallback(
    (rawUrl: string) => {
      const normalized = normalizeUrl(rawUrl);
      if (!normalized) {
        return;
      }
      setUrlInput(normalized);
      cmd.setBrowserTabFaviconUrl(tabId, undefined);
      resetForNavigation();
      if (normalized === resolvedUrl) {
        webviewRef.current?.reload();
      } else {
        setActiveUrl(normalized);
      }
      (document.activeElement as HTMLElement)?.blur();
    },
    [cmd, tabId, setUrlInput, setActiveUrl, resetForNavigation, resolvedUrl, webviewRef],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = urlInput.trim();
      if (!trimmed) {
        cmd.setBrowserTabFaviconUrl(tabId, undefined);
        resetForNavigation();
        setActiveUrl("");
        tabStore.getState().setBrowserTabUrl(tabId, "");
        (document.activeElement as HTMLElement)?.blur();
        return;
      }
      const nextUrl = normalizeUrl(trimmed);
      cmd.setBrowserTabFaviconUrl(tabId, undefined);
      resetForNavigation();
      if (nextUrl === resolvedUrl) {
        webviewRef.current?.reload();
      } else {
        setActiveUrl(nextUrl);
      }
      addHistoryEntry(nextUrl, "");
      (document.activeElement as HTMLElement)?.blur();
    },
    [urlInput, cmd, tabId, setActiveUrl, resetForNavigation, addHistoryEntry, resolvedUrl, webviewRef],
  );

  const handleUrlKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!urlFocused || filteredHistory.length === 0) {
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((prev) => (prev < filteredHistory.length - 1 ? prev + 1 : 0));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filteredHistory.length - 1));
      } else if (event.key === "Enter" && highlightIndex >= 0 && highlightIndex < filteredHistory.length) {
        event.preventDefault();
        const highlightedHistoryEntry = filteredHistory[highlightIndex];
        if (highlightedHistoryEntry) {
          navigateTo(highlightedHistoryEntry.url);
        }
      }
    },
    [urlFocused, filteredHistory, highlightIndex, setHighlightIndex, navigateTo],
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 1.25, gap: 1 }}>
      <UrlBar
        displayUrl={displayUrl}
        urlFocused={urlFocused}
        isHttps={isHttps}
        isHttp={isHttp}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        resolvedUrl={resolvedUrl}
        historyGroups={historyGroups}
        filteredHistory={filteredHistory}
        highlightIndex={highlightIndex}
        textFieldRef={textFieldRef}
        onUrlChange={setUrlInput}
        onSubmit={handleSubmit}
        onFocus={handleUrlFocus}
        onBlur={handleUrlBlur}
        onKeyDown={handleUrlKeyDown}
        onNavigateTo={navigateTo}
        onSetHighlightIndex={setHighlightIndex}
        onGoBack={() => webviewRef.current?.goBack()}
        onGoForward={() => webviewRef.current?.goForward()}
        onReload={() => webviewRef.current?.reload()}
        onToolsClick={(event) => tools.setToolsAnchor(event.currentTarget)}
        inspecting={inspector.inspecting}
        onToggleInspect={inspector.toggleInspecting}
      >
        <LuWrench size={14} />
      </UrlBar>
      <ToolsMenu
        anchorEl={tools.toolsAnchor}
        onClose={tools.closeToolsMenu}
        onOpenDevTools={tools.handleOpenDevTools}
        onForceReload={tools.handleForceReload}
        onTakeSnapshot={tools.handleTakeSnapshot}
        onClearCache={tools.handleClearCache}
        onClearCookies={tools.handleClearCookies}
        onClearHistory={tools.handleClearHistory}
        onClearAllData={tools.handleClearAllData}
      />
      <WebviewPane
        tabId={tabId}
        resolvedUrl={resolvedUrl}
        errorMessage={tools.errorMessage}
        snackbarMessage={snackbarMessage}
        onSetErrorMessage={tools.setErrorMessage}
        onSetSnackbarMessage={clearSnackbarMessage}
        setWebviewRef={setWebviewRef}
        blankContent={<BlankView historyGroups={historyGroups} onNavigateTo={navigateTo} />}
      />
    </Box>
  );
}
