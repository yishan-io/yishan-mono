import { Autocomplete, type AutocompleteRenderInputParams, MenuItem, TextField } from "@mui/material";
import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createLocalTaskTag, setLocalTaskHubFilters } from "../../commands/localTaskCommands";
import type {
  LocalTaskFilters,
  LocalTaskPriority,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
} from "../../localTaskTypes";
import { LocalTaskTagsInput } from "../tags/LocalTaskTagsInput";

type LocalTaskHubFiltersProps = {
  filters: LocalTaskFilters;
  projects: WorkspaceProjectRecord[];
  tagCatalog: LocalTaskTagCatalogEntry[];
};

/** Renders Task Hub project, status, and priority filters. */
export function LocalTaskHubFilters({ filters, projects, tagCatalog }: LocalTaskHubFiltersProps) {
  const { t } = useTranslation();
  const applyFilter = useCallback(
    (field: keyof LocalTaskFilters, value?: LocalTaskFilters[keyof LocalTaskFilters]) => {
      const nextFilters = { ...filters };
      if (Array.isArray(value) ? value.length > 0 : Boolean(value)) Object.assign(nextFilters, { [field]: value });
      else delete nextFilters[field];
      void setLocalTaskHubFilters(nextFilters);
    },
    [filters],
  );
  const handleProjectChange = useCallback(
    (_event: React.SyntheticEvent, project: WorkspaceProjectRecord | null) => applyFilter("projectId", project?.id),
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
    (params: AutocompleteRenderInputParams) => (
      <TextField {...params} size="small" placeholder={t("localTask.fields.project")} />
    ),
    [t],
  );
  const getProjectLabel = useCallback((project: WorkspaceProjectRecord) => project.name, []);

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
      <LocalTaskTagsInput
        tagIds={filters.tagIds ?? []}
        tagCatalog={tagCatalog}
        onChange={(tagIds) => applyFilter("tagIds", tagIds)}
        onCreateTag={createLocalTaskTag}
      />
      <TextField
        select
        size="small"
        value={filters.status ?? ""}
        onChange={handleStatusChange}
        slotProps={{
          select: {
            displayEmpty: true,
            inputProps: { "aria-label": t("localTask.fields.status") },
          },
        }}
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
        value={filters.priority ?? ""}
        onChange={handlePriorityChange}
        slotProps={{
          select: {
            displayEmpty: true,
            inputProps: { "aria-label": t("localTask.fields.priority") },
          },
        }}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">{t("localTask.filters.allPriorities")}</MenuItem>
        <MenuItem value="low">{t("localTask.priority.low")}</MenuItem>
        <MenuItem value="medium">{t("localTask.priority.medium")}</MenuItem>
        <MenuItem value="high">{t("localTask.priority.high")}</MenuItem>
      </TextField>
    </>
  );
}
