import { Alert, Box, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { LuTrash2 } from "react-icons/lu";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { getLocalTaskTagColorValue } from "./localTaskTagColorPresets";

type LocalTaskTagSettingsRowProps = {
  readonly editedName: string;
  readonly isEditDisabled: boolean;
  readonly isEditing: boolean;
  readonly isMergeTarget: boolean;
  readonly measureElement: (node: Element | null) => void;
  readonly tag: LocalTaskTagCatalogEntry;
  readonly virtualIndex: number;
  readonly virtualSize: number;
  readonly virtualStart: number;
  readonly onCancelRename: () => void;
  readonly onDelete: () => void;
  readonly onEditedNameChange: (name: string) => void;
  readonly onOpenColorPicker: (anchor: HTMLElement) => void;
  readonly onRename: () => void;
  readonly onStartRename: () => void;
  readonly t: (key: string, options?: { tag?: string }) => string;
};

/** Renders one neutral, virtualized Local Task tag management row. */
export function LocalTaskTagSettingsRow({
  editedName,
  isEditDisabled,
  isEditing,
  isMergeTarget,
  measureElement,
  tag,
  virtualIndex,
  virtualSize,
  virtualStart,
  onCancelRename,
  onDelete,
  onEditedNameChange,
  onOpenColorPicker,
  onRename,
  onStartRename,
  t,
}: LocalTaskTagSettingsRowProps) {
  return (
    <Box
      aria-label={tag.name}
      component="li"
      data-index={virtualIndex}
      ref={measureElement}
      style={{ transform: `translateY(${virtualStart}px)` }}
      sx={{
        "&:hover": { bgcolor: "action.hover" },
        alignItems: "center",
        display: "flex",
        gap: 1,
        height: virtualSize,
        left: 0,
        position: "absolute",
        px: 1,
        right: 0,
        top: 0,
        width: "auto",
      }}
    >
      <Box
        component="button"
        type="button"
        aria-label={t("localTask.tags.editColor", { tag: tag.name })}
        disabled={isEditDisabled}
        onClick={(event) => onOpenColorPicker(event.currentTarget)}
        sx={(theme) => ({
          backgroundColor:
            tag.customColor ?? (tag.color ? getLocalTaskTagColorValue(tag.color, theme) : theme.palette.text.disabled),
          border: 0,
          borderRadius: "50%",
          cursor: "pointer",
          flex: "0 0 auto",
          height: 12,
          p: 0,
          width: 12,
        })}
      />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {isEditing ? (
          <TextField
            autoFocus
            slotProps={{
              htmlInput: { "aria-label": t("localTask.tags.settings.rename", { tag: tag.name }) },
              input: { sx: { "& .MuiInputBase-input": { py: 0.25 } } },
            }}
            disabled={isEditDisabled}
            fullWidth
            placeholder={t("localTask.tags.settings.renamePlaceholder")}
            size="small"
            value={editedName}
            onBlur={onCancelRename}
            onChange={(event) => onEditedNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancelRename();
              }
            }}
          />
        ) : (
          <Box
            component="button"
            type="button"
            disabled={isEditDisabled}
            onClick={onStartRename}
            sx={{
              background: "none",
              border: 0,
              color: "text.primary",
              cursor: "pointer",
              font: "inherit",
              p: 0,
              textAlign: "left",
            }}
          >
            <Typography component="span">{tag.name}</Typography>
          </Box>
        )}
        {isEditing && isMergeTarget ? (
          <Alert severity="warning" sx={{ mt: 0.5 }}>
            {t("localTask.tags.settings.mergeWarning", { tag: editedName.trim() })}
          </Alert>
        ) : null}
      </Box>
      <Tooltip title={t("localTask.tags.settings.delete", { tag: tag.name })}>
        <Box component="span">
          <IconButton
            aria-label={t("localTask.tags.settings.delete", { tag: tag.name })}
            disabled={isEditDisabled}
            size="small"
            onClick={onDelete}
          >
            <LuTrash2 size={16} />
          </IconButton>
        </Box>
      </Tooltip>
    </Box>
  );
}
