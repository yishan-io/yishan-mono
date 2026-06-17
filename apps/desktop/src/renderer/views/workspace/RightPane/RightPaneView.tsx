import { Box } from "@mui/material";
import { workspaceStore } from "../../../store/workspaceStore";
import { DEFAULT_RIGHT_PANE_TAB, workspaceUiStore } from "../../../store/workspaceUiStore";
import { ChangesTabView } from "./ChangesTabView";
import { FileManagerView } from "./FileManagerView";
import { PullRequestTabView } from "./PullRequestTabView";

export type RightPaneViewProps = {
  onToggleRightPane?: () => void;
};

/**
 * Renders the right pane tab content panels (files, changes, PR).
 * The tab bar and pane header are managed externally by MainPaneView.
 */
export function RightPaneView({ onToggleRightPane: _onToggleRightPane }: RightPaneViewProps = {}) {
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const activeRightPaneTab = workspaceUiStore(
    (state) => state.rightPaneTabByWorkspaceId[selectedWorkspaceId] ?? DEFAULT_RIGHT_PANE_TAB,
  );

  const activeTab = activeRightPaneTab === "changes" ? "changes" : activeRightPaneTab === "pr" ? "pr" : "files";

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
