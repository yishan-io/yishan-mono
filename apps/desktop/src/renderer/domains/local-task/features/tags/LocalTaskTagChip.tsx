import { Box, Chip, type ChipProps, type Theme } from "@mui/material";
import type { LocalTaskTagCatalogEntry, LocalTaskTagRef } from "../../localTaskTypes";
import { getLocalTaskTagCatalogEntry, getLocalTaskTagColorValue } from "./localTaskTagColorPresets";

const localTaskTagChipLabelSx = {
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

type LocalTaskTagChipProps = {
  tag: string | LocalTaskTagRef;
  tagCatalog: LocalTaskTagCatalogEntry[];
  dense?: boolean;
  disabled?: boolean;
  onDotClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onDotMouseDown?: (event: React.MouseEvent<HTMLElement>) => void;
  chipProps?: Omit<ChipProps, "deleteIcon" | "icon" | "label" | "onDelete" | "size" | "variant">;
};

/** Builds layout styles for one neutral Local Task tag chip. */
export function getLocalTaskTagChipSx(_color: LocalTaskTagCatalogEntry["color"], dense: boolean) {
  return (_theme: Theme) => ({
    flexShrink: 0,
    height: "auto",
    maxWidth: "100%",
    "& .MuiChip-label": localTaskTagChipLabelSx,
    ...(dense
      ? {
          minHeight: 18,
          fontSize: "0.6875rem",
          "& .MuiChip-label": { ...localTaskTagChipLabelSx, px: 0.625 },
        }
      : {}),
  });
}

/** Renders one Local Task tag as a neutral chip with a catalog-color dot. */
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
  const color = catalogEntry?.color ?? null;
  const customColor = catalogEntry?.customColor ?? null;

  return (
    <Chip
      {...chipProps}
      size="small"
      variant="outlined"
      label={
        <Box component="span" sx={localTaskTagChipLabelSx}>
          <Box
            component="span"
            aria-hidden="true"
            data-local-task-tag-dot
            onClick={onDotClick}
            onMouseDown={onDotMouseDown}
            sx={(theme) => ({
              bgcolor: customColor ?? (color ? getLocalTaskTagColorValue(color, theme) : theme.palette.text.disabled),
              borderRadius: "50%",
              flex: "0 0 auto",
              height: dense ? 6 : 8,
              width: dense ? 6 : 8,
            })}
          />
          {tagName}
        </Box>
      }
      disabled={disabled || Boolean(chipProps?.disabled)}
      sx={getLocalTaskTagChipSx(color, dense)}
    />
  );
}
