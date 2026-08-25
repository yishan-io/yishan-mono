import { Box, Chip } from "@mui/material";
import type { LocalTaskTagCatalogEntry, LocalTaskTagRef } from "../localTaskTypes";
import { LocalTaskTagChip } from "./LocalTaskTagChip";

type LocalTaskTagsDisplayProps = {
  tagRefs?: LocalTaskTagRef[];
  /** @deprecated Compatibility input for pre-ID callers. */
  tags?: string[];
  maxVisible?: number;
  dense?: boolean;
  tagCatalog?: LocalTaskTagCatalogEntry[];
};

/** Renders Local Task tags as outlined chips, optionally with an overflow count. */
export function LocalTaskTagsDisplay({
  tagRefs,
  tags,
  maxVisible,
  dense = false,
  tagCatalog = [],
}: LocalTaskTagsDisplayProps) {
  const displayTagRefs = tagRefs ?? (tags ?? []).map((name) => ({ id: name, name }));
  const isCompact = maxVisible !== undefined;
  const visibleTags = isCompact ? displayTagRefs.slice(0, maxVisible) : displayTagRefs;
  const remainingCount = isCompact ? Math.max(0, displayTagRefs.length - maxVisible) : 0;

  if (displayTagRefs.length === 0) return null;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: dense ? 0.25 : 0.5,
        minWidth: 0,
        flexWrap: "wrap",
        overflow: "visible",
      }}
    >
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        {visibleTags.map((tag) => (
          <LocalTaskTagChip key={tag.id} tag={tag} tagCatalog={tagCatalog} dense={dense} />
        ))}
      </Box>
      {remainingCount > 0 ? (
        <Chip
          size="small"
          variant="outlined"
          label={`+${remainingCount}`}
          sx={{
            flexShrink: 0,
            borderColor: "divider",
            ...(dense ? { height: 18, fontSize: "0.6875rem", "& .MuiChip-label": { px: 0.625 } } : {}),
          }}
        />
      ) : null}
    </Box>
  );
}
