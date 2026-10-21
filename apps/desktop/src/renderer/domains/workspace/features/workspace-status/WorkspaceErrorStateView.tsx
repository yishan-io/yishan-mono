import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert } from "react-icons/lu";
import { closeWorkspace } from "../../../../domains/workspace/commands/workspaceCloseCommand";
import type { WorkspaceItem } from "../../../../domains/workspace/workspaceTypes";

type WorkspaceErrorStateViewProps = {
  workspace: WorkspaceItem;
  onDeleteProject?: () => void;
};

/**
 * Full-pane error state for a broken (error) workspace. Broken workspaces are
 * shown without tabs, a file tree, or a right pane. Project deletion is
 * supplied by app composition for missing paths.
 */
export function WorkspaceErrorStateView({ workspace, onDeleteProject }: WorkspaceErrorStateViewProps) {
  const { t } = useTranslation();
  const message =
    workspace.health === "not-worktree" ? t("workspace.error.notWorktree") : t("workspace.error.pathMissing");

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
      {workspace.health === "path-missing" && onDeleteProject && (
        <Button variant="outlined" color="error" onClick={onDeleteProject}>
          {t("project.actions.delete")}
        </Button>
      )}
      <Button
        variant="outlined"
        color="error"
        onClick={() => {
          void closeWorkspace(workspace.id);
        }}
      >
        {t("workspace.actions.delete")}
      </Button>
    </Box>
  );
}
