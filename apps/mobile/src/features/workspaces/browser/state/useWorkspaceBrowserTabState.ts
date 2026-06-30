import { useCallback, useEffect, useState } from "react";

import { getParentPath } from "@/features/workspaces/file-browser";
import {
  type WorkspaceBrowserTab,
  clearCachedWorkspaceBrowserTab,
  getCachedWorkspaceBrowserTab,
  setCachedWorkspaceBrowserTab,
} from "./workspaceBrowserState";

export function useWorkspaceBrowserTabState({
  browserStateId,
  explicitFocusedChangePath,
  explicitFocusedFilePath,
  explicitDirectoryPath,
  hasExplicitTabParam,
  routeTab,
}: {
  browserStateId: string;
  explicitFocusedChangePath: string;
  explicitFocusedFilePath: string;
  explicitDirectoryPath: string;
  hasExplicitTabParam: boolean;
  routeTab: WorkspaceBrowserTab;
}) {
  const [activeTab, setActiveTabState] = useState<WorkspaceBrowserTab>(() => {
    if (hasExplicitTabParam) {
      return routeTab;
    }

    return getCachedWorkspaceBrowserTab(browserStateId);
  });
  const [focusedFilePath, setFocusedFilePath] = useState(explicitFocusedFilePath);
  const [focusedChangePath, setFocusedChangePath] = useState(explicitFocusedChangePath);

  useEffect(() => {
    setActiveTabState(hasExplicitTabParam ? routeTab : getCachedWorkspaceBrowserTab(browserStateId));
    setFocusedFilePath(explicitFocusedFilePath);
    setFocusedChangePath(explicitFocusedChangePath);
  }, [browserStateId, explicitFocusedChangePath, explicitFocusedFilePath, hasExplicitTabParam, routeTab]);

  useEffect(() => {
    if (!browserStateId) {
      return;
    }

    if (hasExplicitTabParam) {
      clearCachedWorkspaceBrowserTab(browserStateId);
      return;
    }

    setCachedWorkspaceBrowserTab(browserStateId, activeTab);
  }, [activeTab, browserStateId, hasExplicitTabParam]);

  const setActiveTab = useCallback((tab: WorkspaceBrowserTab) => {
    setActiveTabState(tab);
  }, []);

  const directoryPath = explicitDirectoryPath || getParentPath(focusedFilePath);

  return {
    activeTab,
    directoryPath,
    focusedChangePath,
    focusedFilePath,
    setActiveTab,
    setFocusedChangePath,
    setFocusedFilePath,
  };
}
