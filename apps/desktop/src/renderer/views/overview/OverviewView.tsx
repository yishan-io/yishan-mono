import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useCallback, useEffect } from "react";
import { LuChartBar } from "react-icons/lu";
import { PaneHeader } from "../../components/PaneHeader";
import { PaneToggleButton } from "../../components/PaneToggleButton";
import { getRendererPlatform } from "../../helpers/platform";
import { useCommands } from "../../hooks/useCommands";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import { overviewStore } from "../../store/overviewStore";
import { workspaceStore } from "../../store/workspaceStore";
import { ModelBreakdownView } from "./ModelBreakdownView";
import { OverviewFiltersView } from "./OverviewFiltersView";
import { TokenUsageChartView } from "./TokenUsageChartView";
import { WorkspaceInsightsView } from "./WorkspaceInsightsView";

type OverviewViewProps = {
  onClose?: () => void;
};

export function OverviewView({ onClose }: OverviewViewProps = {}) {
  const { leftCollapsed, onToggleLeftPane } = useWorkspacePaneVisibilityContext();
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", getRendererPlatform());
  const toggleLeftTooltipLabel = `Toggle left sidebar (${toggleLeftShortcutLabel})`;
  const shouldReserveMacInset = getRendererPlatform() === "darwin" && leftCollapsed;

  const tokenUsageLoadState = overviewStore((state) => state.tokenUsageLoadState);
  const tokenUsageLoadError = overviewStore((state) => state.tokenUsageLoadError);
  const modelBreakdownLoadState = overviewStore((state) => state.modelBreakdownLoadState);
  const modelBreakdownLoadError = overviewStore((state) => state.modelBreakdownLoadError);
  const workspaceInsightsLoadState = overviewStore((state) => state.workspaceInsightsLoadState);
  const workspaceInsightsLoadError = overviewStore((state) => state.workspaceInsightsLoadError);
  const projects = workspaceStore((state) => state.projects);

  const { loadAllOverviewData } = useCommands();

  useEffect(() => {
    void loadAllOverviewData();
  }, [loadAllOverviewData]);

  const hasAnyError =
    tokenUsageLoadState === "error" || modelBreakdownLoadState === "error" || workspaceInsightsLoadState === "error";

  const isLoading =
    (tokenUsageLoadState === "loading" || tokenUsageLoadState === "idle") &&
    (modelBreakdownLoadState === "loading" || modelBreakdownLoadState === "idle") &&
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
              ariaLabel="Toggle left sidebar"
              icon={<LuChartBar size={16} />}
              onClick={onToggleLeftPane}
            />
          ) : (
            <LuChartBar size={16} />
          )}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Overview
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
                  Retry
                </Button>
              }
            >
              {tokenUsageLoadError ??
                modelBreakdownLoadError ??
                workspaceInsightsLoadError ??
                "Failed to load overview data"}
            </Alert>
          </Box>
        ) : null}

        {!isLoading && !hasAnyError ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TokenUsageChartView />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                gap: 3,
              }}
            >
              <ModelBreakdownView />
              <WorkspaceInsightsView />
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
