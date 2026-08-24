import { Box, Chip, type ChipProps, type Theme } from "@mui/material";
import type { LocalTaskTagCatalogEntry, LocalTaskTagRef } from "../localTaskTypes";
import { getLocalTaskTagCatalogEntry } from "./localTaskTagColorPresets";

const tagChipLabelSx = {
  alignItems: "center",
  display: "flex",
  gap: 0.5,
  minWidth: 0,
  overflow: "visible",
  overflowWrap: "anywhere",
  textOverflow: "clip",
  whiteSpace: "normal",
  wordBreak: "break-word",
} as const;

/** Builds layout styles for one Local Task tag chip. */
export function getLocalTaskTagChipSx(dense: boolean) {
  return (_theme: Theme) => ({
    flexShrink: 0,
    height: "auto",
    maxWidth: "100%",
    "& .MuiChip-label": tagChipLabelSx,
    ...(dense
      ? {
          minHeight: 18,
          fontSize: "0.6875rem",
          "& .MuiChip-label": { ...tagChipLabelSx, px: 0.625 },
        }
      : {}),
  });
}

type LocalTaskTagChipProps = {
  tag: string | LocalTaskTagRef;
  tagCatalog: LocalTaskTagCatalogEntry[];
  dense?: boolean;
  disabled?: boolean;
  onDotClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onDotMouseDown?: (event: React.MouseEvent<HTMLElement>) => void;
  chipProps?: Omit<ChipProps, "deleteIcon" | "icon" | "label" | "onDelete" | "size" | "variant">;
};

/** Resolves tag ref/catalog/color and renders a Local Task tag chip. */
export function LocalTaskTagChip({
  tag,
  tagCatalog,
  dense = false,
  disabled = false,
  onDotClick,
  onDotMouseDown,
  chipProps,
}: LocalTaskTagChipProps) {
  const tagID = typeof tag === "string" ? undefined : tag.id;
  const tagName = typeof tag === "string" ? tag : (tag.name ?? tag.id);
  const catalogEntry = tagID
    ? tagCatalog.find((entry) => entry.id === tagID)
    : getLocalTaskTagCatalogEntry(tagName, tagCatalog);
  const dotColor = catalogEntry?.color ?? null;

  return (
    <Chip
      {...chipProps}
      size="small"
      variant="outlined"
      label={
        <Box component="span" sx={tagChipLabelSx}>
          <Box
            component="span"
            aria-hidden="true"
            data-tag-chip-dot
            onClick={onDotClick}
            onMouseDown={onDotMouseDown}
            sx={{
              bgcolor: dotColor ?? "text.disabled",
              borderRadius: "50%",
              flex: "0 0 auto",
              height: dense ? 6 : 8,
              width: dense ? 6 : 8,
            }}
          />
          {tagName}
        </Box>
      }
      disabled={disabled || Boolean(chipProps?.disabled)}
      sx={getLocalTaskTagChipSx(dense)}
    />
  );
}
