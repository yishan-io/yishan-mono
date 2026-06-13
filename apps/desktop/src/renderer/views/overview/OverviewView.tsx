import { Alert, Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LuChartBar } from "react-icons/lu";
import { PaneHeader } from "../../components/PaneHeader";
import { PaneToggleButton } from "../../components/PaneToggleButton";
import { getRendererPlatform } from "../../helpers/platform";
import { useCommands } from "../../hooks/useCommands";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import { overviewStore } from "../../store/overviewStore";
import { workspaceStore } from "../../store/workspaceStore";
import { AgentKindChartView } from "./AgentKindChartView";
import { ModelBreakdownView } from "./ModelBreakdownView";
import { OverviewFiltersView } from "./OverviewFiltersView";
import { TokenUsageChartView } from "./TokenUsageChartView";
import { WorkspaceInsightsView } from "./WorkspaceInsightsView";

type OverviewViewProps = {
  onClose?: () => void;
};

const panelSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  bgcolor: "background.paper",
  p: 2,
} as const;

export function OverviewView({ onClose }: OverviewViewProps = {}) {
  const { t } = useTranslation();
  const { leftCollapsed, onToggleLeftPane } = useWorkspacePaneVisibilityContext();
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", getRendererPlatform());
  const toggleLeftTooltipLabel = `Toggle left sidebar (${toggleLeftShortcutLabel})`;
  const shouldReserveMacInset = getRendererPlatform() === "darwin" && leftCollapsed;

  const tokenUsageLoadState = overviewStore((state) => state.tokenUsageLoadState);
  const tokenUsageLoadError = overviewStore((state) => state.tokenUsageLoadError);
  const modelBreakdownLoadState = overviewStore((state) => state.modelBreakdownLoadState);
  const modelBreakdownLoadError = overviewStore((state) => state.modelBreakdownLoadError);
  const agentKindBreakdownLoadState = overviewStore((state) => state.agentKindBreakdownLoadState);
  const agentKindBreakdownLoadError = overviewStore((state) => state.agentKindBreakdownLoadError);
  const workspaceInsightsLoadState = overviewStore((state) => state.workspaceInsightsLoadState);
  const workspaceInsightsLoadError = overviewStore((state) => state.workspaceInsightsLoadError);
  const projects = workspaceStore((state) => state.projects);

  const { loadAllOverviewData } = useCommands();

  useEffect(() => {
    void loadAllOverviewData();
  }, [loadAllOverviewData]);

  const hasAnyError =
    tokenUsageLoadState === "error" ||
    modelBreakdownLoadState === "error" ||
    agentKindBreakdownLoadState === "error" ||
    workspaceInsightsLoadState === "error";

  const isLoading =
    (tokenUsageLoadState === "loading" || tokenUsageLoadState === "idle") &&
    (modelBreakdownLoadState === "loading" || modelBreakdownLoadState === "idle") &&
    (agentKindBreakdownLoadState === "loading" || agentKindBreakdownLoadState === "idle") &&
    (workspaceInsightsLoadState === "loading" || workspaceInsightsLoadState === "idle");

  const handleRetry = useCallback(() => {
    void loadAllOverviewData();
  }, [loadAllOverviewData]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      <PaneHeader justifyContent="space-between" showMacInset={shouldReserveMacInset}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
          {leftCollapsed ? (
            <PaneToggleButton
              tooltipLabel={toggleLeftTooltipLabel}
              ariaLabel={t("overview.toggleLeftSidebar")}
              icon={<LuChartBar size={16} />}
              onClick={onToggleLeftPane}
            />
          ) : (
            <LuChartBar size={16} />
          )}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("overview.title")}
          </Typography>
        </Box>
      </PaneHeader>

      <Box sx={{ flex: 1, overflow: "auto", px: 2, py: 2 }}>
        <OverviewFiltersView projects={projects} />

        {isLoading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 8 }}>
            <CircularProgress size={24} />
          </Box>
        ) : null}

        {hasAnyError ? (
          <Box sx={{ mb: 2 }}>
            <Alert
              severity="error"
              action={
                <Button size="small" onClick={handleRetry}>
                  {t("overview.retry")}
                </Button>
              }
            >
              {tokenUsageLoadError ??
                modelBreakdownLoadError ??
                agentKindBreakdownLoadError ??
                workspaceInsightsLoadError ??
                t("overview.loadError")}
            </Alert>
          </Box>
        ) : null}

        {!isLoading && !hasAnyError ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                gap: 3,
              }}
            >
              <Paper sx={panelSx}>
                <TokenUsageChartView />
              </Paper>
              <Paper sx={panelSx}>
                <AgentKindChartView />
              </Paper>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                gap: 3,
              }}
            >
              <Paper sx={panelSx}>
                <ModelBreakdownView />
              </Paper>
              <Paper sx={panelSx}>
                <WorkspaceInsightsView />
              </Paper>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
