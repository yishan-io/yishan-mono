import { Box, FormControl, MenuItem, Select, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OverviewTimeRange } from "../../api/overviewApi.types";
import { setOverviewProjectId, setOverviewTimeRange } from "../../commands/overviewCommands";
import { overviewStore } from "../../store/overviewStore";
import type { WorkspaceProjectRecord } from "../../store/types";

const TIME_RANGE_OPTIONS: { value: OverviewTimeRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

type OverviewFiltersViewProps = {
  projects: WorkspaceProjectRecord[];
};

export function OverviewFiltersView({ projects }: OverviewFiltersViewProps) {
  const { t } = useTranslation();
  const timeRange = overviewStore((state) => state.timeRange);
  const selectedProjectId = overviewStore((state) => state.selectedProjectId);

  const handleTimeRangeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, value: OverviewTimeRange | null) => {
      if (value) {
        setOverviewTimeRange(value);
      }
    },
    [],
  );

  const handleProjectChange = useCallback((event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    setOverviewProjectId(value || undefined);
  }, []);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
      <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
        {t("overview.filters.timeRange")}
      </Typography>
      <ToggleButtonGroup value={timeRange} exclusive onChange={handleTimeRangeChange} size="small" sx={{ mr: 2 }}>
        {TIME_RANGE_OPTIONS.map((option) => (
          <ToggleButton key={option.value} value={option.value} sx={{ textTransform: "none", px: 1.5 }}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
        {t("overview.filters.project")}
      </Typography>
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <Select value={selectedProjectId ?? ""} onChange={handleProjectChange} displayEmpty sx={{ fontSize: 13 }}>
          <MenuItem value="">{t("overview.filters.allProjects")}</MenuItem>
          {projects.map((project) => (
            <MenuItem key={project.id} value={project.id}>
              {project.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" sx={{ ml: "auto", color: "text.disabled" }}>
        {t("overview.filters.utcNote")}
      </Typography>
    </Box>
  );
}
