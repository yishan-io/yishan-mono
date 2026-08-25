import { Box, ButtonBase, IconButton, Menu, MenuItem, Paper, Tooltip, Typography } from "@mui/material";
import { ConfirmationDialog } from "@renderer/ui/components/ConfirmationDialog";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuEllipsis } from "react-icons/lu";
import { unlinkLocalTaskWorkspace, updateLocalTaskLinkStatus } from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskTagCatalogEntry, LocalTaskWorkspaceLink } from "../../localTaskTypes";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";
import { LocalTaskStatusIcon } from "../../ui/LocalTaskStatusIcon";
import { LocalTaskTagsDisplay } from "../../ui/LocalTaskTagsDisplay";

type WorkspaceTaskLinkRowProps = {
  link: LocalTaskWorkspaceLink;
  task?: LocalTask;
  selected: boolean;
  isMutationLoading: boolean;
  onSelect: (taskId: string) => void;
  tagCatalog: LocalTaskTagCatalogEntry[];
};

/** Renders one selectable current or historical workspace-task relationship and its supported actions. */
export function WorkspaceTaskLinkRow({
  link,
  task,
  selected,
  isMutationLoading,
  onSelect,
  tagCatalog,
}: WorkspaceTaskLinkRowProps) {
  const { t } = useTranslation();
  const [isConfirmingUnlink, setIsConfirmingUnlink] = useState(false);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null);
  const isUnlinked = link.unlinkedAt !== null;
  const linkStatus = isUnlinked ? "unlinked" : link.status;
  const linkStatusLabel = isUnlinked ? t("localTask.link.unlinked") : t(`localTask.status.${link.status}`);
  const runLinkMutation = useCallback((operation: () => Promise<unknown>, message: string) => {
    void operation().catch((error) => console.error(message, error));
  }, []);
  const handleSelect = useCallback(() => onSelect(link.localTaskId), [link.localTaskId, onSelect]);
  const handleConfirmUnlink = useCallback(() => {
    runLinkMutation(() => unlinkLocalTaskWorkspace(link.id), "Failed to unlink Local Task");
    setIsConfirmingUnlink(false);
  }, [link.id, runLinkMutation]);
  const handleToggleStatus = useCallback(() => {
    setActionMenuAnchor(null);
    runLinkMutation(
      () => updateLocalTaskLinkStatus(link.id, link.status === "active" ? "paused" : "active"),
      "Failed to update Local Task link",
    );
  }, [link.id, link.status, runLinkMutation]);
  const handleComplete = useCallback(() => {
    setActionMenuAnchor(null);
    runLinkMutation(() => updateLocalTaskLinkStatus(link.id, "completed"), "Failed to complete Local Task link");
  }, [link.id, runLinkMutation]);
  const handleRequestUnlink = useCallback(() => {
    setActionMenuAnchor(null);
    setIsConfirmingUnlink(true);
  }, []);
  const handleOpenActionMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setActionMenuAnchor(event.currentTarget);
  }, []);
  const handleCloseActionMenu = useCallback(() => setActionMenuAnchor(null), []);

  return (
    <Paper
      elevation={0}
      sx={{
        overflow: "visible",
        border: 0,
        boxShadow: "none",
        bgcolor: "transparent",
        transition: (theme) =>
          theme.transitions.create("background-color", { duration: theme.transitions.duration.shortest }),
        position: "relative",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <ButtonBase
        onClick={handleSelect}
        aria-pressed={selected}
        sx={{
          width: "100%",
          p: 0.5,
          pr: isUnlinked ? 0.5 : 4.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          textAlign: "left",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flex: 1, minWidth: 0 }}>
          {task ? (
            <Tooltip title={t(`localTask.priority.${task.priority}`)}>
              <LocalTaskPriorityIcon
                priority={task.priority}
                aria-label={`${t("localTask.fields.priority")}: ${t(`localTask.priority.${task.priority}`)}`}
              />
            </Tooltip>
          ) : null}
          <LocalTaskStatusIcon status={linkStatus} label={linkStatusLabel} />
          <Typography variant="body2" sx={{ fontSize: "0.8125rem" }} noWrap>
            {task?.title ?? link.localTaskId}
          </Typography>
        </Box>
        {task ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: "auto", minWidth: 0 }}>
            <LocalTaskTagsDisplay
              tagRefs={task.tagRefs}
              tags={task.tagRefs.length === 0 ? task.tags : undefined}
              maxVisible={2}
              dense
              tagCatalog={tagCatalog}
            />
          </Box>
        ) : null}
      </ButtonBase>
      {!isUnlinked ? (
        <>
          <IconButton
            size="small"
            disabled={isMutationLoading}
            aria-label={t("localTask.actions.taskMenu")}
            onClick={handleOpenActionMenu}
            sx={{ position: "absolute", top: 4, right: 4 }}
          >
            <LuEllipsis size={16} />
          </IconButton>
          <Menu anchorEl={actionMenuAnchor} open={Boolean(actionMenuAnchor)} onClose={handleCloseActionMenu}>
            <MenuItem disabled={isMutationLoading} onClick={handleToggleStatus}>
              {t(link.status === "active" ? "localTask.actions.pauseLink" : "localTask.actions.reactivateLink")}
            </MenuItem>
            {link.status !== "completed" ? (
              <MenuItem disabled={isMutationLoading} onClick={handleComplete}>
                {t("localTask.actions.completeLink")}
              </MenuItem>
            ) : null}
            <MenuItem disabled={isMutationLoading} onClick={handleRequestUnlink} sx={{ color: "error.main" }}>
              {t("localTask.actions.unlink")}
            </MenuItem>
          </Menu>
        </>
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
