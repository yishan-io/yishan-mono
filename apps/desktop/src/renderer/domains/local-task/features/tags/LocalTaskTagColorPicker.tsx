import { Alert, Box, Button, Popover } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalTaskTagCatalogEntry, LocalTaskTagColor, LocalTaskTagCustomColor } from "../../localTaskTypes";
import { getLocalTaskTagCatalogEntry, getLocalTaskTagColorValue } from "./localTaskTagColorPresets";

const TAG_COLORS = ["amber", "blue", "green", "purple", "red", "teal"] as const;

type LocalTaskTagColorPickerProps = {
  anchorEl: HTMLElement | null;
  tagName: string | null;
  tagCatalog: LocalTaskTagCatalogEntry[];
  disabled: boolean;
  onTagColorChange?: (
    tag: string,
    color: LocalTaskTagColor | null,
    customColor?: LocalTaskTagCustomColor | null,
  ) => Promise<unknown>;
  onClose: () => void;
};

/** Selects a catalog tag's preset or custom color. */
export function LocalTaskTagColorPicker({
  anchorEl,
  tagName,
  tagCatalog,
  disabled,
  onTagColorChange,
  onClose,
}: LocalTaskTagColorPickerProps) {
  const { t } = useTranslation();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [colorUpdateError, setColorUpdateError] = useState<string | null>(null);
  const [isColorUpdating, setIsColorUpdating] = useState(false);
  const colorTag = useMemo(
    () => (tagName ? (getLocalTaskTagCatalogEntry(tagName, tagCatalog) ?? null) : null),
    [tagName, tagCatalog],
  );
  const handleColorChange = useCallback(
    async (color: LocalTaskTagColor | null, customColor: LocalTaskTagCustomColor | null = null) => {
      if (!tagName || !onTagColorChange || isColorUpdating) return;
      setIsColorUpdating(true);
      setColorUpdateError(null);
      try {
        await onTagColorChange(tagName, color, customColor);
        onClose();
      } catch (error) {
        setColorUpdateError(getErrorMessage(error));
      } finally {
        setIsColorUpdating(false);
      }
    },
    [isColorUpdating, onClose, onTagColorChange, tagName],
  );

  return (
    <Popover anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => !isColorUpdating && onClose()}>
      <Box
        component="fieldset"
        aria-label={t("localTask.tags.colorPicker", { tag: tagName })}
        sx={{ border: 0, m: 0, p: 1 }}
      >
        {colorUpdateError ? <Alert severity="error">{colorUpdateError}</Alert> : null}
        <Box aria-label={t("localTask.tags.presetColors")} sx={{ display: "flex", gap: 0.75, my: 0.5 }}>
          {TAG_COLORS.map((color) => (
            <Box
              key={color}
              component="button"
              type="button"
              aria-label={t(`localTask.tags.color.${color}`)}
              aria-pressed={colorTag?.color === color}
              disabled={disabled || isColorUpdating}
              onClick={() => void handleColorChange(color)}
              sx={(theme) => ({
                backgroundColor: getLocalTaskTagColorValue(color, theme),
                border: 0,
                borderRadius: "50%",
                cursor: "pointer",
                height: 20,
                width: 20,
              })}
            />
          ))}
        </Box>
        <Button size="small" disabled={disabled || isColorUpdating} onClick={() => colorInputRef.current?.click()}>
          {t("localTask.tags.customizeColor")}
        </Button>
        <Button size="small" disabled={disabled || isColorUpdating} onClick={() => void handleColorChange(null)}>
          {t("localTask.tags.clearColor")}
        </Button>
        <input
          ref={colorInputRef}
          aria-label={t("localTask.tags.customColorInput")}
          type="color"
          hidden
          onChange={(event) => void handleColorChange(null, event.target.value as LocalTaskTagCustomColor)}
        />
      </Box>
    </Popover>
  );
}
