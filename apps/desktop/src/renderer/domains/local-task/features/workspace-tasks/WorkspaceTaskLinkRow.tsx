import { Box, Button, ButtonBase, Chip, Paper, Typography } from "@mui/material";
import { ConfirmationDialog } from "@renderer/ui/components/ConfirmationDialog";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  setPrimaryLocalTask,
  unlinkLocalTaskWorkspace,
  updateLocalTaskLinkStatus,
} from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskWorkspaceLink } from "../../localTaskTypes";

type WorkspaceTaskLinkRowProps = {
  link: LocalTaskWorkspaceLink;
  task?: LocalTask;
  selected: boolean;
  isMutationLoading: boolean;
  onSelect: (taskId: string) => void;
};

/** Renders one selectable current or historical workspace-task relationship and its supported actions. */
export function WorkspaceTaskLinkRow({ link, task, selected, isMutationLoading, onSelect }: WorkspaceTaskLinkRowProps) {
  const { t } = useTranslation();
  const [isConfirmingUnlink, setIsConfirmingUnlink] = useState(false);
  const isUnlinked = link.unlinkedAt !== null;
  const runLinkMutation = useCallback((operation: () => Promise<unknown>, message: string) => {
    void operation().catch((error) => console.error(message, error));
  }, []);
  const handleSelect = useCallback(() => onSelect(link.localTaskId), [link.localTaskId, onSelect]);
  const handleConfirmUnlink = useCallback(() => {
    runLinkMutation(() => unlinkLocalTaskWorkspace(link.id), "Failed to unlink Local Task");
    setIsConfirmingUnlink(false);
  }, [link.id, runLinkMutation]);

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", borderColor: selected ? "primary.main" : "divider" }}>
      <ButtonBase
        onClick={handleSelect}
        aria-pressed={selected}
        sx={{ width: "100%", p: 1.25, display: "flex", alignItems: "center", gap: 0.75, textAlign: "left" }}
      >
        <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
          {task?.title ?? link.localTaskId}
        </Typography>
        <Chip size="small" label={t(`localTask.link.${link.role}`)} />
        <Chip
          size="small"
          variant="outlined"
          label={isUnlinked ? t("localTask.link.unlinked") : t(`localTask.status.${link.status}`)}
        />
      </ButtonBase>
      {!isUnlinked ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 1.25, pb: 1.25 }}>
          {link.role !== "primary" ? (
            <Button
              size="small"
              disabled={isMutationLoading}
              onClick={() =>
                runLinkMutation(
                  () => setPrimaryLocalTask(link.localTaskId, link.workspaceId),
                  "Failed to set primary Local Task",
                )
              }
            >
              {t("localTask.actions.setPrimary")}
            </Button>
          ) : null}
          <Button
            size="small"
            disabled={isMutationLoading}
            onClick={() =>
              runLinkMutation(
                () => updateLocalTaskLinkStatus(link.id, link.status === "active" ? "paused" : "active"),
                "Failed to update Local Task link",
              )
            }
          >
            {t(link.status === "active" ? "localTask.actions.pauseLink" : "localTask.actions.reactivateLink")}
          </Button>
          {link.status !== "completed" ? (
            <Button
              size="small"
              disabled={isMutationLoading}
              onClick={() =>
                runLinkMutation(
                  () => updateLocalTaskLinkStatus(link.id, "completed"),
                  "Failed to complete Local Task link",
                )
              }
            >
              {t("localTask.actions.completeLink")}
            </Button>
          ) : null}
          <Button size="small" color="error" disabled={isMutationLoading} onClick={() => setIsConfirmingUnlink(true)}>
            {t("localTask.actions.unlink")}
          </Button>
        </Box>
      ) : null}
      <ConfirmationDialog
        open={isConfirmingUnlink}
        title={t("localTask.unlink.title")}
        description={t("localTask.unlink.description", { title: task?.title ?? link.localTaskId })}
        confirmLabel={t("localTask.actions.unlink")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isMutationLoading}
        onCancel={() => setIsConfirmingUnlink(false)}
        onConfirm={handleConfirmUnlink}
      />
    </Paper>
  );
}
