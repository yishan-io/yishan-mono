import { Box, Checkbox, IconButton, MenuItem, MenuList, Popover, TextField, Typography } from "@mui/material";
import { type WorkspaceProjectRecord, renderProjectIcon } from "@renderer/domains/project";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowLeft, LuBox, LuChartNoAxesColumnIncreasing, LuChevronRight, LuCircleDot, LuTag } from "react-icons/lu";
import { setLocalTaskHubFilters } from "../../commands/localTaskCommands";
import type {
  LocalTaskFilters,
  LocalTaskPriority,
  LocalTaskStatus,
  LocalTaskTagCatalogEntry,
} from "../../localTaskTypes";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";
import { LocalTaskStatusIcon } from "../../ui/LocalTaskStatusIcon";
import { LocalTaskHubVirtualizedFilterValues } from "./LocalTaskHubVirtualizedFilterValues";

type ProjectFilterOption = Pick<WorkspaceProjectRecord, "id" | "name" | "icon">;
type FilterField = "projectId" | "status" | "priority" | "tagIds";

type LocalTaskHubFilterMenuProps = {
  anchorEl: HTMLElement | null;
  filters: LocalTaskFilters;
  projects: ProjectFilterOption[];
  tagCatalog: LocalTaskTagCatalogEntry[];
  onClose: () => void;
};

const filterFields: { field: FilterField; labelKey: string }[] = [
  { field: "projectId", labelKey: "localTask.fields.project" },
  { field: "status", labelKey: "localTask.fields.status" },
  { field: "priority", labelKey: "localTask.fields.priority" },
  { field: "tagIds", labelKey: "localTask.fields.tags" },
];

/** Provides the anchored Task Hub filter field and value picker. */
export function LocalTaskHubFilterMenu({
  anchorEl,
  filters,
  projects,
  tagCatalog,
  onClose,
}: LocalTaskHubFilterMenuProps) {
  const { t } = useTranslation();
  const [selectedField, setSelectedField] = useState<FilterField | null>(null);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const filteredTagCatalog = useMemo(() => {
    const normalizedQuery = tagSearchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return tagCatalog;
    return tagCatalog.filter((tag) => tag.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [tagCatalog, tagSearchQuery]);
  const handleClose = useCallback(() => {
    setSelectedField(null);
    setTagSearchQuery("");
    onClose();
  }, [onClose]);
  const handleApply = useCallback(
    (field: FilterField, value: string | string[] | undefined) => {
      const nextFilters = { ...filters };
      if (Array.isArray(value) ? value.length > 0 : value) Object.assign(nextFilters, { [field]: value });
      else delete nextFilters[field];
      void setLocalTaskHubFilters(nextFilters);
      handleClose();
    },
    [filters, handleClose],
  );
  const handleSelectStatus = useCallback(
    (status: LocalTaskStatus) => {
      const selectedStatuses = filters.status ?? [];
      const statuses = selectedStatuses.includes(status)
        ? selectedStatuses.filter((selectedStatus) => selectedStatus !== status)
        : [...selectedStatuses, status];
      if (statuses.length > 0) {
        void setLocalTaskHubFilters({ ...filters, status: statuses });
        return;
      }
      const { status: _status, ...filtersWithoutStatus } = filters;
      void setLocalTaskHubFilters(filtersWithoutStatus);
    },
    [filters],
  );
  const handleSelectTag = useCallback(
    (tagId: string) => {
      const selectedTagIds = filters.tagIds ?? [];
      const tagIds = selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId];
      if (tagIds.length > 0) {
        void setLocalTaskHubFilters({ ...filters, tagIds });
        return;
      }
      const { tagIds: _tagIds, ...filtersWithoutTagIds } = filters;
      void setLocalTaskHubFilters(filtersWithoutTagIds);
    },
    [filters],
  );
  const handleSelectField = useCallback((field: FilterField) => {
    setSelectedField(field);
    setTagSearchQuery("");
  }, []);
  const handleBack = useCallback(() => {
    setSelectedField(null);
    setTagSearchQuery("");
  }, []);

  const renderValues = () => {
    if (selectedField === "projectId") {
      return (
        <LocalTaskHubVirtualizedFilterValues
          options={projects}
          renderOption={(project) => (
            <MenuItem key={project.id} onClick={() => handleApply("projectId", project.id)}>
              <Box component="span" aria-hidden="true" sx={{ display: "inline-flex", mr: 1 }}>
                {renderProjectIcon(project.icon ?? undefined, 15)}
              </Box>
              {project.name}
            </MenuItem>
          )}
        />
      );
    }
    if (selectedField === "status") {
      const statuses: LocalTaskStatus[] = ["new", "progressing", "done", "cancelled"];
      return statuses.map((status) => {
        const isSelected = (filters.status ?? []).includes(status);
        return (
          <MenuItem
            key={status}
            aria-checked={isSelected}
            role="menuitemcheckbox"
            selected={isSelected}
            onClick={() => handleSelectStatus(status)}
          >
            <Checkbox checked={isSelected} size="small" slotProps={{ input: { "aria-hidden": true } }} tabIndex={-1} />
            <LocalTaskStatusIcon status={status} />
            <Box component="span" sx={{ ml: 1 }}>
              {t(`localTask.status.${status}`)}
            </Box>
          </MenuItem>
        );
      });
    }
    if (selectedField === "priority") {
      const priorities: LocalTaskPriority[] = ["low", "medium", "high"];
      return priorities.map((priority) => (
        <MenuItem key={priority} onClick={() => handleApply("priority", priority)}>
          <LocalTaskPriorityIcon priority={priority} />
          <Box component="span" sx={{ ml: 1 }}>
            {t(`localTask.priority.${priority}`)}
          </Box>
        </MenuItem>
      ));
    }
    return (
      <>
        <Box sx={{ px: 0.5, py: 0.75 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder={t("localTask.filters.searchTags")}
            value={tagSearchQuery}
            onChange={(event) => setTagSearchQuery(event.target.value)}
            slotProps={{ htmlInput: { "aria-label": t("localTask.filters.searchTags") } }}
            sx={{ "& .MuiInputBase-root": { minHeight: 30 }, "& .MuiInputBase-input": { py: 0.5 } }}
          />
        </Box>
        <LocalTaskHubVirtualizedFilterValues
          autoFocusItem={false}
          options={filteredTagCatalog}
          renderOption={(tag) => {
            const isSelected = (filters.tagIds ?? []).includes(tag.id);
            return (
              <MenuItem key={tag.id} selected={isSelected} onClick={() => handleSelectTag(tag.id)}>
                <Checkbox checked={isSelected} size="small" tabIndex={-1} />
                <Box
                  component="span"
                  aria-hidden="true"
                  data-tag-filter-dot
                  sx={{
                    bgcolor: tag.color ?? "text.disabled",
                    borderRadius: "50%",
                    flex: "0 0 auto",
                    height: 8,
                    mr: 0.75,
                    width: 8,
                  }}
                />
                {tag.name}
              </MenuItem>
            );
          }}
        />
      </>
    );
  };

  return (
    <Popover
      id="local-task-hub-filter-menu"
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={handleClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { sx: { mt: 0.5, width: 260 } } }}
    >
      <Box sx={{ p: 0.75 }}>
        {selectedField ? (
          <>
            <Box sx={{ display: "flex", alignItems: "center", px: 0.5 }}>
              <IconButton size="small" aria-label={t("common.actions.back")} onClick={handleBack}>
                <LuArrowLeft size={15} />
              </IconButton>
              <Typography variant="body2" sx={{ fontWeight: 600, ml: 0.5 }}>
                {t(filterFields.find(({ field }) => field === selectedField)?.labelKey ?? "")}
              </Typography>
            </Box>
            {selectedField === "projectId" || selectedField === "tagIds" ? (
              renderValues()
            ) : (
              <MenuList>{renderValues()}</MenuList>
            )}
          </>
        ) : (
          <MenuList>
            {filterFields.map(({ field, labelKey }) => (
              <MenuItem key={field} onClick={() => handleSelectField(field)}>
                <Box component="span" sx={{ display: "inline-flex", mr: 1 }}>
                  {field === "projectId" ? (
                    <LuBox aria-hidden="true" size={16} />
                  ) : field === "status" ? (
                    <LuCircleDot aria-hidden="true" size={16} />
                  ) : field === "priority" ? (
                    <LuChartNoAxesColumnIncreasing aria-hidden="true" size={16} />
                  ) : (
                    <LuTag aria-hidden="true" size={16} />
                  )}
                </Box>
                <Typography component="span" variant="body2" sx={{ flex: 1 }}>
                  {t(labelKey)}
                </Typography>
                <LuChevronRight aria-hidden="true" size={16} />
              </MenuItem>
            ))}
          </MenuList>
        )}
      </Box>
    </Popover>
  );
}
