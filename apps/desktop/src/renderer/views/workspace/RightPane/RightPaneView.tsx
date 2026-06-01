import { Box } from "@mui/material";
import { useState } from "react";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
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
  const activeRightPaneTab = workspaceUiStore((state) => state.rightPaneTab);
  const openFileSearchRequestKey = workspaceUiStore((state) => state.fileSearchRequestKey);
  const [lastHandledFileSearchRequestKey, setLastHandledFileSearchRequestKey] = useState(
    () => workspaceUiStore.getState().fileSearchRequestKey,
  );

  const activeTab = activeRightPaneTab === "changes" ? "changes" : activeRightPaneTab === "pr" ? "pr" : "files";

  return (
    <Box
      data-testid="dashboard-sidebar"
      sx={{
        width: "100%",
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: activeTab === "files" ? "block" : "none",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <FileManagerView
          openFileSearchRequestKey={openFileSearchRequestKey}
          lastHandledFileSearchRequestKey={lastHandledFileSearchRequestKey}
          onFileSearchRequestHandled={(requestKey) => {
            setLastHandledFileSearchRequestKey((currentValue) => Math.max(currentValue, requestKey));
          }}
        />
      </Box>
      <Box
        sx={{
          display: activeTab === "changes" ? "flex" : "none",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <ChangesTabView />
      </Box>
      <Box
        sx={{
          display: activeTab === "pr" ? "flex" : "none",
          flex: 1,
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
