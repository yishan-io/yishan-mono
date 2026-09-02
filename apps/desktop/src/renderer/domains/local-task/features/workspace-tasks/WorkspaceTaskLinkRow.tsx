import { Box, ButtonBase, Card, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { ConfirmationDialog } from "@renderer/ui/components/ConfirmationDialog";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuEllipsis } from "react-icons/lu";
import { unlinkLocalTaskWorkspace } from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskTagCatalogEntry, LocalTaskWorkspaceLink } from "../../localTaskTypes";
import { LocalTaskKeyDisplay } from "../../ui/LocalTaskKeyDisplay";
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
  const displayedStatus = isUnlinked ? "unlinked" : (task?.status ?? link.status);
  const displayedStatusLabel = isUnlinked ? t("localTask.link.unlinked") : t(`localTask.status.${displayedStatus}`);
  const runLinkMutation = useCallback((operation: () => Promise<unknown>, message: string) => {
    void operation().catch((error) => console.error(message, error));
  }, []);
  const handleSelect = useCallback(() => onSelect(link.localTaskId), [link.localTaskId, onSelect]);
  const handleConfirmUnlink = useCallback(() => {
    runLinkMutation(() => unlinkLocalTaskWorkspace(link.id), "Failed to unlink Local Task");
    setIsConfirmingUnlink(false);
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
    <Card
      variant="outlined"
      sx={{
        mb: 0.5,
        p: 1.25,
        overflow: "visible",
        bgcolor: "background.paper",
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
          p: 0,
          pr: isUnlinked ? 0 : 3.5,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          textAlign: "left",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
          {task ? (
            <Tooltip title={t(`localTask.priority.${task.priority}`)}>
              <LocalTaskPriorityIcon
                priority={task.priority}
                aria-label={`${t("localTask.fields.priority")}: ${t(`localTask.priority.${task.priority}`)}`}
              />
            </Tooltip>
          ) : null}
          <LocalTaskStatusIcon status={displayedStatus} label={displayedStatusLabel} />
          {task ? <LocalTaskKeyDisplay task={task} /> : null}
          <Typography variant="body2" sx={{ fontSize: "0.875rem" }} noWrap>
            {task?.title ?? link.localTaskId}
          </Typography>
        </Box>
        {task ? (
          <Box data-testid="workspace-task-card-tags" sx={{ mt: 1.5, minWidth: 0 }}>
            <LocalTaskTagsDisplay
              tagRefs={task.tagRefs}
              tags={task.tagRefs.length === 0 ? task.tags : undefined}
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
            sx={{ position: "absolute", top: 6, right: 6 }}
          >
            <LuEllipsis size={16} />
          </IconButton>
          <Menu anchorEl={actionMenuAnchor} open={Boolean(actionMenuAnchor)} onClose={handleCloseActionMenu}>
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
    </Card>
  );
}
