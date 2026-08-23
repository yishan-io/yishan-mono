import { Box, Chip } from "@mui/material";

type LocalTaskTagsDisplayProps = {
  tags: string[];
  maxVisible?: number;
  dense?: boolean;
};

/** Renders Local Task tags as outlined chips, optionally with an overflow count. */
export function LocalTaskTagsDisplay({ tags, maxVisible, dense = false }: LocalTaskTagsDisplayProps) {
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
        flexWrap: isCompact ? "nowrap" : "wrap",
        overflow: "visible",
      }}
    >
      <Box
        sx={
          isCompact
            ? { display: "flex", gap: 0.5, minWidth: 0, flex: "1 1 0", overflow: "hidden" }
            : { display: "flex", gap: 0.5, flexWrap: "wrap" }
        }
      >
        {visibleTags.map((tag) => (
          <Chip
            key={tag}
            size="small"
            variant="outlined"
            label={tag}
            sx={{
              ...(isCompact ? { flex: dense ? "0 1 auto" : "1 1 0", minWidth: 0, maxWidth: dense ? 88 : 120 } : {}),
              ...(dense ? { height: 18, fontSize: "0.6875rem", "& .MuiChip-label": { px: 0.625 } } : {}),
            }}
          />
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
