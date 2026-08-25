import { Box, IconButton, Typography } from "@mui/material";
import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LuX } from "react-icons/lu";
import { setLocalTaskHubFilters } from "../../commands/localTaskCommands";
import type { LocalTaskFilters, LocalTaskTagCatalogEntry } from "../../localTaskTypes";

type ProjectFilterOption = Pick<WorkspaceProjectRecord, "id" | "name">;
type FilterChip = { field: keyof LocalTaskFilters; fieldLabel: string; valueLabel: string };

type LocalTaskHubFilterChipsProps = {
  filters: LocalTaskFilters;
  projects: ProjectFilterOption[];
  tagCatalog: LocalTaskTagCatalogEntry[];
};

/** Renders compact active Task Hub filters and their removal controls. */
export function LocalTaskHubFilterChips({ filters, projects, tagCatalog }: LocalTaskHubFilterChipsProps) {
  const { t } = useTranslation();
  const filterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filters.projectId) {
      chips.push({
        field: "projectId",
        fieldLabel: t("localTask.fields.project"),
        valueLabel: projects.find((project) => project.id === filters.projectId)?.name ?? filters.projectId,
      });
    }
    if (filters.status)
      chips.push({
        field: "status",
        fieldLabel: t("localTask.fields.status"),
        valueLabel: t(`localTask.status.${filters.status}`),
      });
    if (filters.priority)
      chips.push({
        field: "priority",
        fieldLabel: t("localTask.fields.priority"),
        valueLabel: t(`localTask.priority.${filters.priority}`),
      });
    if (filters.tagIds?.length) {
      const tagNames = filters.tagIds.map((tagId) => tagCatalog.find((tag) => tag.id === tagId)?.name ?? tagId);
      chips.push({ field: "tagIds", fieldLabel: t("localTask.fields.tags"), valueLabel: tagNames.join(", ") });
    }
    return chips;
  }, [filters, projects, t, tagCatalog]);
  const handleRemove = useCallback(
    (field: keyof LocalTaskFilters) => {
      const nextFilters = { ...filters };
      delete nextFilters[field];
      void setLocalTaskHubFilters(nextFilters);
    },
    [filters],
  );

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5 }}>
      {filterChips.map((chip) => {
        const filterLabel = `${chip.fieldLabel} ${chip.valueLabel}`;
        return (
          <Box
            key={chip.field}
            aria-label={filterLabel}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 0,
              height: 26,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden",
              fontSize: "0.75rem",
            }}
          >
            <Typography component="span" variant="caption" sx={{ px: 1, whiteSpace: "nowrap" }}>
              {chip.fieldLabel}
            </Typography>
            <Typography component="span" variant="caption" sx={{ borderLeft: 1, borderColor: "divider", px: 1 }}>
              {t("localTask.filters.is")}
            </Typography>
            <Typography component="span" variant="caption" sx={{ borderLeft: 1, borderColor: "divider", px: 1 }} noWrap>
              {chip.valueLabel}
            </Typography>
            <IconButton
              size="small"
              aria-label={t("localTask.filters.remove", { field: chip.fieldLabel })}
              onClick={() => handleRemove(chip.field)}
              sx={{ borderLeft: 1, borderColor: "divider", borderRadius: 0, height: "100%", px: 0.75 }}
            >
              <LuX size={14} />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );
}
