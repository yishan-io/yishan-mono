import { Box, Chip } from "@mui/material";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskTagChip } from "./LocalTaskTagChip";

type LocalTaskTagsDisplayProps = {
  tags: string[];
  maxVisible?: number;
  dense?: boolean;
  tagCatalog?: LocalTaskTagCatalogEntry[];
};

/** Renders Local Task tags as outlined chips, optionally with an overflow count. */
export function LocalTaskTagsDisplay({ tags, maxVisible, dense = false, tagCatalog = [] }: LocalTaskTagsDisplayProps) {
  const isCompact = maxVisible !== undefined;
  const visibleTags = isCompact ? tags.slice(0, maxVisible) : tags;
  const remainingCount = isCompact ? Math.max(0, tags.length - maxVisible) : 0;

  if (tags.length === 0) return null;
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
          <LocalTaskTagChip key={tag} tag={tag} tagCatalog={tagCatalog} dense={dense} />
        ))}
      </Box>
      {remainingCount > 0 ? (
        <Chip
          size="small"
          variant="outlined"
          label={`+${remainingCount}`}
          sx={{
            flexShrink: 0,
            ...(dense ? { height: 18, fontSize: "0.6875rem", "& .MuiChip-label": { px: 0.625 } } : {}),
          }}
        />
      ) : null}
    </Box>
  );
}
