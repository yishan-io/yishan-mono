import { useMemo } from "react";

import type { OpenWorkspaceBrowserInput, ShellWorkspaceBrowserSelectionContext } from "./shell-action-builders";
import { buildWorkspaceBrowserInputFromSelection } from "./shell-action-builders";

export function useShellWorkspaceBrowserQuickActions({
  activePaneTabKind,
  openWorkspaceBrowser,
  selectedWorkspaceBrowserContext,
}: {
  activePaneTabKind: string | null;
  openWorkspaceBrowser: (input: OpenWorkspaceBrowserInput) => void;
  selectedWorkspaceBrowserContext: ShellWorkspaceBrowserSelectionContext | null;
}) {
  const browserOpenHandler = useMemo(() => {
    const request = buildWorkspaceBrowserInputFromSelection(
      selectedWorkspaceBrowserContext,
      activePaneTabKind === "diff" ? "changes" : "files",
    );
    return request ? () => openWorkspaceBrowser(request) : null;
  }, [activePaneTabKind, openWorkspaceBrowser, selectedWorkspaceBrowserContext]);

  const openFilesHandler = useMemo(() => {
    const request = buildWorkspaceBrowserInputFromSelection(selectedWorkspaceBrowserContext, "files");
    return request ? () => openWorkspaceBrowser(request) : null;
  }, [openWorkspaceBrowser, selectedWorkspaceBrowserContext]);

  const openChangesHandler = useMemo(() => {
    const request = buildWorkspaceBrowserInputFromSelection(selectedWorkspaceBrowserContext, "changes");
    return request ? () => openWorkspaceBrowser(request) : null;
  }, [openWorkspaceBrowser, selectedWorkspaceBrowserContext]);

  const openPullRequestsHandler = useMemo(() => {
    const request = buildWorkspaceBrowserInputFromSelection(selectedWorkspaceBrowserContext, "prs");
    return request ? () => openWorkspaceBrowser(request) : null;
  }, [openWorkspaceBrowser, selectedWorkspaceBrowserContext]);

  return {
    browserOpenHandler,
    openChangesHandler,
    openFilesHandler,
    openPullRequestsHandler,
  };
}
