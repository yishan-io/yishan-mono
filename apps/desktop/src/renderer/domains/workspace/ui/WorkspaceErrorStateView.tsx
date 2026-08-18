import { Box, Button, Typography } from "@mui/material";
import { LuTriangleAlert } from "react-icons/lu";
import { closeWorkspace } from "../../../domains/workspace/commands/workspaceCloseCommand";
import type { WorkspaceItem } from "../../../domains/workspace/model/workspaceTypes";

type WorkspaceErrorStateViewProps = {
  workspace: WorkspaceItem;
};

/**
 * Full-pane error state for a broken (error) workspace. Broken workspaces are
 * close-only: no tabs, no file tree, no right pane. This view replaces the
 * main content area and offers the single allowed action (close).
 */
export function WorkspaceErrorStateView({ workspace }: WorkspaceErrorStateViewProps) {
  const message =
    workspace.health === "not-worktree"
      ? "This workspace path is not a git worktree. Close the workspace to remove it."
      : "This workspace worktree is missing. Close the workspace to remove it.";

  return (
    <Box
      data-testid="workspace-error-state"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        px: 3,
        textAlign: "center",
      }}
    >
      <Box component="span" sx={{ display: "inline-flex", color: "error.main" }}>
        <LuTriangleAlert size={32} />
      </Box>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
      <Button
        variant="outlined"
        color="error"
        onClick={() => {
          void closeWorkspace(workspace.id);
        }}
      >
        Close workspace
      </Button>
    </Box>
  );
}
