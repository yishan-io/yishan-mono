import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuArrowLeft, LuPanelLeft, LuPause, LuPencil, LuPlay, LuTrash2, LuZap } from "react-icons/lu";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { PaneHeader } from "../../components/PaneHeader";
import { PaneToggleButton } from "../../components/PaneToggleButton";
import { SplitPaneLayout } from "../../components/SplitPaneLayout";
import { getRendererPlatform } from "../../helpers/platform";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import { scheduledJobStore } from "../../store/scheduledJobStore";
import { sessionStore } from "../../store/sessionStore";
import { EditScheduledJobDialogView } from "./EditScheduledJobDialogView";
import { ScheduledJobDetailFields } from "./ScheduledJobDetailFields";
import { ScheduledJobRunsSidebar } from "./ScheduledJobRunsSidebar";
import { useScheduledJobDetailState } from "./useScheduledJobDetailState";

type ScheduledJobDetailViewProps = {
  job: ScheduledJobRecord;
  onBack: () => void;
};

/** Renders the detail view for one scheduled job with a runs history sidebar. */
export function ScheduledJobDetailView({ job, onBack }: ScheduledJobDetailViewProps) {
  const { t } = useTranslation();
  const { leftCollapsed, onToggleLeftPane } = useWorkspacePaneVisibilityContext();
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", getRendererPlatform());
  const toggleLeftTooltipLabel = `${t("layout.toggleLeftSidebar")} (${toggleLeftShortcutLabel})`;
  const shouldReserveMacInset = getRendererPlatform() === "darwin" && leftCollapsed;
  const isPending = scheduledJobStore((state) => state.pendingActionIds.includes(job.id));
  const orgId = sessionStore((state) => state.selectedOrganizationId ?? "");
  const {
    runsPaneWidth,
    isEditOpen,
    isDeleteOpen,
    isDeleting,
    setIsEditOpen,
    setIsDeleteOpen,
    handleResizeStart,
    handleResizeMove,
    handlePause,
    handleResume,
    handleConfirmDelete,
    handleRunNow,
  } = useScheduledJobDetailState({ job, orgId, onBack });

  const primaryAction = job.status === "active" ? "pause" : job.status === "paused" ? "resume" : null;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PaneHeader justifyContent="space-between" showMacInset={shouldReserveMacInset}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, flex: 1 }}>
          {leftCollapsed ? (
            <PaneToggleButton
              tooltipLabel={toggleLeftTooltipLabel}
              ariaLabel={t("layout.toggleLeftSidebar")}
              icon={<LuPanelLeft size={16} />}
              onClick={onToggleLeftPane}
            />
          ) : null}
          <Box className="electron-webkit-app-region-no-drag" sx={{ display: "inline-flex" }}>
            <IconButton onClick={onBack} aria-label={t("scheduledJob.detail.back")}>
              <LuArrowLeft size={16} />
            </IconButton>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {job.name}
          </Typography>
        </Box>
        <Box className="electron-webkit-app-region-no-drag" sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {primaryAction ? (
            <Tooltip title={t(`scheduledJob.actions.${primaryAction}`)}>
              <Box className="electron-webkit-app-region-no-drag" sx={{ display: "inline-flex" }}>
                <Button
                  size="small"
                  variant="text"
                  startIcon={primaryAction === "pause" ? <LuPause size={13} /> : <LuPlay size={13} />}
                  onClick={primaryAction === "pause" ? handlePause : handleResume}
                  disabled={isPending}
                  sx={{ color: "text.secondary", minWidth: 92 }}
                >
                  {t(`scheduledJob.actions.${primaryAction}`)}
                </Button>
              </Box>
            </Tooltip>
          ) : null}
          <Tooltip title={t("scheduledJob.actions.runNow")}>
            <Button
              size="small"
              variant="text"
              startIcon={<LuZap size={13} />}
              onClick={() => void handleRunNow()}
              disabled={isPending}
              sx={{ color: "text.secondary", px: 1.5 }}
            >
              {t("scheduledJob.actions.runNow")}
            </Button>
          </Tooltip>
          <Tooltip title={t("scheduledJob.actions.edit")}>
            <Button
              size="small"
              variant="text"
              startIcon={<LuPencil size={13} />}
              onClick={() => setIsEditOpen(true)}
              sx={{ color: "text.secondary" }}
            >
              {t("scheduledJob.actions.edit")}
            </Button>
          </Tooltip>
          <Tooltip title={t("scheduledJob.actions.delete")}>
            <IconButton
              onClick={() => setIsDeleteOpen(true)}
              aria-label={t("scheduledJob.actions.delete")}
              sx={{
                color: "text.secondary",
                ":hover": {
                  color: "error.main",
                },
              }}
            >
              <LuTrash2 size={15} />
            </IconButton>
          </Tooltip>
        </Box>
      </PaneHeader>

      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <SplitPaneLayout
          position="right"
          collapsed={false}
          resizeLabel={t("scheduledJob.runs.resizeLabel")}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          sideContent={
            <Box sx={{ width: runsPaneWidth, minWidth: runsPaneWidth, height: "100%" }}>
              <ScheduledJobRunsSidebar orgId={orgId} job={job} />
            </Box>
          }
        >
          <ScheduledJobDetailFields job={job} orgId={orgId} />
        </SplitPaneLayout>
      </Box>

      <EditScheduledJobDialogView job={job} open={isEditOpen} onClose={() => setIsEditOpen(false)} />

      <ConfirmationDialog
        open={isDeleteOpen}
        title={t("scheduledJob.delete.title")}
        description={t("scheduledJob.delete.description", { name: job.name })}
        confirmLabel={t("scheduledJob.delete.confirm")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isDeleting}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </Box>
  );
}
