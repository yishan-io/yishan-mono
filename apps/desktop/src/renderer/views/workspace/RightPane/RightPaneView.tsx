import { Box } from "@mui/material";
import { projectStore } from "../../../features/project/model/projectStore";
import { isFolderWorkspace } from "../../../helpers/localFolder";
import { supportsGitFeatures } from "../../../helpers/projectGitCapability";
import { workspaceStore } from "../../../store/workspaceStore";
import { DEFAULT_RIGHT_PANE_TAB, workspaceUiStore } from "../../../store/workspaceUiStore";
import { ChangesTabView } from "./ChangesTabView";
import { PullRequestTabView } from "./PullRequestTabView";
import { FileManagerView } from "./fileTree/FileManagerView";

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
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const selectedWorkspace = workspaceStore((state) =>
    state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId),
  );
  const selectedProject = projectStore((state) =>
    state.projects.find((project) => project.id === (selectedWorkspace?.projectId ?? selectedWorkspace?.repoId)),
  );
  const activeRightPaneTab = workspaceUiStore(
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
