import { Autocomplete, type AutocompleteRenderInputParams, MenuItem, TextField } from "@mui/material";
import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { setLocalTaskHubFilters } from "../../commands/localTaskCommands";
import type { LocalTaskFilters, LocalTaskPriority, LocalTaskStatus } from "../../localTaskTypes";

type LocalTaskHubFiltersProps = {
  filters: LocalTaskFilters;
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
};

/** Renders Task Hub project, status, priority, and workspace filters. */
export function LocalTaskHubFilters({ filters, projects, workspaces }: LocalTaskHubFiltersProps) {
  const { t } = useTranslation();
  const applyFilter = useCallback(
    (field: keyof LocalTaskFilters, value?: string) => {
      const nextFilters = { ...filters };
      if (value) Object.assign(nextFilters, { [field]: value });
      else delete nextFilters[field];
      void setLocalTaskHubFilters(nextFilters);
    },
    [filters],
  );
  const handleProjectChange = useCallback(
    (_event: React.SyntheticEvent, project: WorkspaceProjectRecord | null) => applyFilter("projectId", project?.id),
    [applyFilter],
  );
  const handleWorkspaceChange = useCallback(
    (_event: React.SyntheticEvent, workspace: WorkspaceItem | null) => applyFilter("workspaceId", workspace?.id),
    [applyFilter],
  );
  const handleStatusChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => applyFilter("status", event.target.value as LocalTaskStatus),
    [applyFilter],
  );
  const handlePriorityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => applyFilter("priority", event.target.value as LocalTaskPriority),
    [applyFilter],
  );
  const renderProjectInput = useCallback(
    (params: AutocompleteRenderInputParams) => <TextField {...params} label={t("localTask.fields.project")} />,
    [t],
  );
  const renderWorkspaceInput = useCallback(
    (params: AutocompleteRenderInputParams) => <TextField {...params} label={t("localTask.fields.workspace")} />,
    [t],
  );
  const getProjectLabel = useCallback((project: WorkspaceProjectRecord) => project.name, []);
  const getWorkspaceLabel = useCallback((workspace: WorkspaceItem) => workspace.title || workspace.name, []);

  return (
    <>
      <Autocomplete
        size="small"
        options={projects}
        value={projects.find((project) => project.id === filters.projectId) ?? null}
        onChange={handleProjectChange}
        getOptionLabel={getProjectLabel}
        renderInput={renderProjectInput}
        slotProps={{ listbox: { component: VirtualizedListbox } }}
        sx={{ minWidth: 150 }}
      />
      <TextField
        select
        size="small"
        label={t("localTask.fields.status")}
        value={filters.status ?? ""}
        onChange={handleStatusChange}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">{t("localTask.filters.allStatuses")}</MenuItem>
        <MenuItem value="active">{t("localTask.status.active")}</MenuItem>
        <MenuItem value="paused">{t("localTask.status.paused")}</MenuItem>
        <MenuItem value="completed">{t("localTask.status.completed")}</MenuItem>
      </TextField>
      <TextField
        select
        size="small"
        label={t("localTask.fields.priority")}
        value={filters.priority ?? ""}
        onChange={handlePriorityChange}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">{t("localTask.filters.allPriorities")}</MenuItem>
        <MenuItem value="low">{t("localTask.priority.low")}</MenuItem>
        <MenuItem value="medium">{t("localTask.priority.medium")}</MenuItem>
        <MenuItem value="high">{t("localTask.priority.high")}</MenuItem>
      </TextField>
      <Autocomplete
        size="small"
        options={workspaces}
        value={workspaces.find((workspace) => workspace.id === filters.workspaceId) ?? null}
        onChange={handleWorkspaceChange}
        getOptionLabel={getWorkspaceLabel}
        renderInput={renderWorkspaceInput}
        slotProps={{ listbox: { component: VirtualizedListbox } }}
        sx={{ minWidth: 160 }}
      />
    </>
  );
}
