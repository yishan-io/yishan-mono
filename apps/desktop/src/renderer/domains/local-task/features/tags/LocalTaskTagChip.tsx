import { Box, Chip, type ChipProps, type Theme } from "@mui/material";
import { LuX } from "react-icons/lu";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
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
  tag: string;
  tagCatalog: LocalTaskTagCatalogEntry[];
  dense?: boolean;
  disabled?: boolean;
  onDelete?: (event: React.SyntheticEvent) => void;
  onDotClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onDotMouseDown?: (event: React.MouseEvent<HTMLElement>) => void;
  deleteAriaLabel?: string;
  chipProps?: Omit<ChipProps, "icon" | "label" | "size" | "variant">;
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
  onDelete,
  onDotClick,
  onDotMouseDown,
  deleteAriaLabel,
  chipProps,
}: LocalTaskTagChipProps) {
  const catalogEntry = getLocalTaskTagCatalogEntry(tag, tagCatalog);
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
          {tag}
        </Box>
      }
      disabled={disabled || Boolean(chipProps?.disabled)}
      onDelete={onDelete}
      deleteIcon={onDelete ? <LuX aria-label={deleteAriaLabel} /> : undefined}
      sx={getLocalTaskTagChipSx(color, dense)}
    />
  );
}
