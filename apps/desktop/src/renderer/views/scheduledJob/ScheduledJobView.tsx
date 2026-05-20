import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPlus, LuZap } from "react-icons/lu";
import { PaneHeader } from "../../components/PaneHeader";
import { getRendererPlatform } from "../../helpers/platform";
import { useCommands } from "../../hooks/useCommands";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { scheduledJobStore } from "../../store/scheduledJobStore";
import { CreateScheduledJobDialogView } from "./CreateScheduledJobDialogView";
import { ScheduledJobDetailView } from "./ScheduledJobDetailView";
import { ScheduledJobListItemView } from "./ScheduledJobListItemView";

const thSx = {
  px: 1.5,
  py: 0.75,
  textAlign: "left" as const,
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "text.secondary",
  borderBottom: "1px solid",
  borderColor: "divider",
  whiteSpace: "nowrap" as const,
  bgcolor: "background.paper",
} as const;

type ScheduledJobViewProps = {
  /** Called when the user closes the panel. */
  onClose?: () => void;
};

/** Renders the scheduled job management panel with list and detail views. */
export function ScheduledJobView({ onClose: _onClose }: ScheduledJobViewProps = {}) {
  const { t } = useTranslation();
  const { leftCollapsed } = useWorkspacePaneVisibilityContext();
  const shouldReserveMacInset = getRendererPlatform() === "darwin" && leftCollapsed;
  const jobs = scheduledJobStore((state) => state.scheduledJobs);
  const loadState = scheduledJobStore((state) => state.loadState);
  const loadError = scheduledJobStore((state) => state.loadError);
  const { loadScheduledJobs } = useCommands();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    void loadScheduledJobs();
  }, [loadScheduledJobs]);

  const handleRetry = useCallback(() => {
    void loadScheduledJobs();
  }, [loadScheduledJobs]);

  const isLoading = loadState === "loading" || loadState === "idle";
  const hasError = loadState === "error";
  const isEmpty = loadState === "loaded" && jobs.length === 0;
  const hasJobs = loadState === "loaded" && jobs.length > 0;

  const selectedJob = selectedJobId ? (jobs.find((j) => j.id === selectedJobId) ?? null) : null;

  // If the selected job was removed from the store (e.g. after refresh), clear selection.
  useEffect(() => {
    if (selectedJobId && !jobs.find((j) => j.id === selectedJobId)) {
      setSelectedJobId(null);
    }
  }, [jobs, selectedJobId]);

  // Detail view
  if (selectedJob) {
    return (
      <>
        <ScheduledJobDetailView job={selectedJob} onBack={() => setSelectedJobId(null)} />
        <CreateScheduledJobDialogView open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} />
      </>
    );
  }

  return (
    <>
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <PaneHeader justifyContent="space-between" showMacInset={shouldReserveMacInset}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
            <LuZap size={16} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t("scheduledJob.title")}
            </Typography>
          </Box>
          <Box className="electron-webkit-app-region-no-drag">
            <Button
              size="small"
              variant="text"
              startIcon={<LuPlus size={13} />}
              onClick={() => setIsCreateDialogOpen(true)}
              sx={{ textTransform: "none", color: "text.secondary" }}
              aria-label={t("scheduledJob.actions.new")}
            >
              {t("scheduledJob.actions.new")}
            </Button>
          </Box>
        </PaneHeader>

        {/* Body */}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {isLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 8 }}>
              <CircularProgress size={24} />
            </Box>
          ) : null}

          {hasError ? (
            <Box sx={{ p: 2 }}>
              <Alert
                severity="error"
                action={
                  <Button size="small" onClick={handleRetry}>
                    {t("scheduledJob.actions.retry")}
                  </Button>
                }
              >
                {loadError ?? t("scheduledJob.loadError")}
              </Alert>
            </Box>
          ) : null}

          {isEmpty ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 8,
                gap: 1,
                color: "text.secondary",
              }}
            >
              <LuZap size={32} />
              <Typography variant="body2">{t("scheduledJob.empty")}</Typography>
            </Box>
          ) : null}

          {hasJobs ? (
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
              <Box component="thead">
                <Box component="tr">
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.name")}
                  </Box>
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.project")}
                  </Box>
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.schedule")}
                  </Box>
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.agent")}
                  </Box>
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.status")}
                  </Box>
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.lastRun")}
                  </Box>
                  <Box component="th" sx={thSx}>
                    {t("scheduledJob.columns.nextRun")}
                  </Box>
                  <Box component="th" sx={{ ...thSx, width: 28, px: 0.5 }} />
                </Box>
              </Box>
              <Box component="tbody">
                {jobs.map((job) => (
                  <ScheduledJobListItemView key={job.id} job={job} onOpenDetails={setSelectedJobId} />
                ))}
              </Box>
            </Box>
          ) : null}
        </Box>
      </Box>

      <CreateScheduledJobDialogView open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} />
    </>
  );
}
