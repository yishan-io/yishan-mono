import { Box } from "@mui/material";
import { ChangesTabView } from "@renderer/features/git";
import { PullRequestTabView } from "@renderer/features/git";
import { DEFAULT_RIGHT_PANE_TAB, layoutStore } from "@renderer/features/workbench";
import { useSelectedWorkspaceWithProject } from "../../../../app/selectors";
import { FileManagerView } from "../../../../features/files/ui/FileManagerView";
import { workspaceStore } from "../../../../features/workspace/state/workspaceStore";
import { isFolderWorkspace } from "../../../../helpers/localFolder";
import { supportsGitFeatures } from "../../../../helpers/projectGitCapability";

export type RightPaneViewProps = {
  onToggleRightPane?: () => void;
};

/**
 * Renders the right pane tab content panels (files, changes, PR).
 * The tab bar and pane header are managed externally by MainPaneView.
 * For error (broken) workspaces the right pane is hidden entirely by
 * MainPaneView; this view only serves healthy workspaces.
 */
export function RightPaneView({ onToggleRightPane: _onToggleRightPane }: RightPaneViewProps = {}) {
  const { selectedWorkspaceId, selectedWorkspace, selectedProject } = useSelectedWorkspaceWithProject();
  const activeRightPaneTab = layoutStore(
    (state) => state.rightPaneTabByWorkspaceId[selectedWorkspaceId] ?? DEFAULT_RIGHT_PANE_TAB,
  );

  // Non-git projects only have the files pane: fall back when the persisted
  // tab points at a git-only tab (changes/PR).
  // Folder workspaces have no real project (undefined). Derive git capability
  // from the workspace first so folders never resolve to git-capable.
  const gitCapable = !isFolderWorkspace(selectedWorkspace) && supportsGitFeatures(selectedProject?.sourceType);
  const activeTab =
    !gitCapable || activeRightPaneTab === "files"
      ? "files"
      : activeRightPaneTab === "changes"
        ? "changes"
        : activeRightPaneTab === "pr"
          ? "pr"
          : "files";

  return (
    <Box
      data-testid="dashboard-sidebar"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          visibility: activeTab === "files" ? "visible" : "hidden",
          zIndex: activeTab === "files" ? 1 : 0,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <FileManagerView />
      </Box>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          visibility: activeTab === "changes" ? "visible" : "hidden",
          zIndex: activeTab === "changes" ? 1 : 0,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <ChangesTabView />
      </Box>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          visibility: activeTab === "pr" ? "visible" : "hidden",
          zIndex: activeTab === "pr" ? 1 : 0,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <PullRequestTabView active={activeTab === "pr"} />
      </Box>
    </Box>
  );
}
