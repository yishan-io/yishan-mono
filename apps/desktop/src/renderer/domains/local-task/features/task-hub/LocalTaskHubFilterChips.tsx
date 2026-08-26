import { Box, Button, IconButton, Typography } from "@mui/material";
import { type WorkspaceProjectRecord, renderProjectIcon } from "@renderer/domains/project";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LuBox, LuCircleDot, LuTag, LuX } from "react-icons/lu";
import { setLocalTaskHubFilters } from "../../commands/localTaskCommands";
import type { LocalTaskFilters, LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskPriorityIcon } from "../../ui/LocalTaskPriorityIcon";

type ProjectFilterOption = Pick<WorkspaceProjectRecord, "id" | "name" | "icon">;
type FilterChip = {
  field: keyof LocalTaskFilters;
  fieldLabel: string;
  valueLabel: string;
  tagColors?: Array<string | null>;
};

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
    if (filters.status?.length)
      chips.push({
        field: "status",
        fieldLabel: t("localTask.fields.status"),
        valueLabel: filters.status.map((status) => t(`localTask.status.${status}`)).join(", "),
      });
    if (filters.priority)
      chips.push({
        field: "priority",
        fieldLabel: t("localTask.fields.priority"),
        valueLabel: t(`localTask.priority.${filters.priority}`),
      });
    if (filters.tagIds?.length) {
      const tags = filters.tagIds.map((tagId) => tagCatalog.find((tag) => tag.id === tagId));
      const tagNames = tags.map((tag, index) => tag?.name ?? filters.tagIds?.[index] ?? "");
      chips.push({
        field: "tagIds",
        fieldLabel: t("localTask.fields.tags"),
        valueLabel: tagNames.join(", "),
        tagColors: tags.map((tag) => tag?.color ?? null),
      });
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
  const handleClearAll = useCallback(() => void setLocalTaskHubFilters({}), []);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5 }}>
      {filterChips.map((chip) => {
        const filterLabel = `${chip.fieldLabel} ${chip.valueLabel}`;
        const project = chip.field === "projectId" ? projects.find((item) => item.id === filters.projectId) : undefined;
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
            <Box
              component="span"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, whiteSpace: "nowrap" }}
            >
              {chip.field === "projectId" ? (
                <LuBox aria-hidden="true" size={14} />
              ) : chip.field === "status" ? (
                <LuCircleDot aria-hidden="true" size={14} />
              ) : chip.field === "priority" && filters.priority ? (
                <LocalTaskPriorityIcon priority={filters.priority} size={14} />
              ) : (
                <LuTag aria-hidden="true" size={14} />
              )}
              <Typography component="span" variant="caption">
                {chip.fieldLabel}
              </Typography>
            </Box>
            <Typography component="span" variant="caption" sx={{ borderLeft: 1, borderColor: "divider", px: 1 }}>
              {t("localTask.filters.is")}
            </Typography>
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                borderLeft: 1,
                borderColor: "divider",
                px: 1,
              }}
            >
              {project ? (
                <Box component="span" sx={{ display: "inline-flex", mr: 0.75 }}>
                  {renderProjectIcon(project.icon ?? undefined, 14)}
                </Box>
              ) : chip.field === "priority" && filters.priority ? (
                <Box component="span" sx={{ display: "inline-flex", mr: 0.75 }}>
                  <LocalTaskPriorityIcon priority={filters.priority} size={14} />
                </Box>
              ) : null}
              {chip.tagColors ? (
                <Box component="span" sx={{ display: "inline-flex", gap: 0.25, mr: 0.75 }}>
                  {chip.tagColors.map((color, index) => (
                    <Box
                      component="span"
                      aria-hidden="true"
                      key={`${color ?? "default"}-${index}`}
                      sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color ?? "text.disabled" }}
                    />
                  ))}
                </Box>
              ) : null}
              <Typography component="span" variant="caption" noWrap>
                {chip.valueLabel}
              </Typography>
            </Box>
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
      {filterChips.length > 0 ? (
        <Button size="small" onClick={handleClearAll} sx={{ minWidth: 0, px: 0.75 }}>
          {t("localTask.filters.clearAll")}
        </Button>
      ) : null}
    </Box>
  );
}
