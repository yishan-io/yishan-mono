import { Alert, Box, Button, InputBase, Popover, Typography } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalTaskTagCatalogEntry, LocalTaskTagColor, LocalTaskTagCustomColor } from "../../localTaskTypes";
import { LocalTaskTagHsvPicker } from "./LocalTaskTagHsvPicker";
import { type HsvColor, getHexFromHsv, getHsvFromHex, isValidHexColor } from "./localTaskTagColorHsv";
import { getLocalTaskTagCatalogEntry, getLocalTaskTagColorValue } from "../../ui/localTaskTagColorPresets";

const TAG_COLORS = ["amber", "blue", "green", "purple", "red", "teal"] as const;
const DEFAULT_CUSTOM_COLOR: HsvColor = { hue: 0, saturation: 100, value: 100 };
const COLOR_WHEEL_BACKGROUND =
  "conic-gradient(from 0deg, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))";
const SWATCH_SIZE = 24;

type LocalTaskTagColorPickerProps = {
  anchorEl: HTMLElement | null;
  anchorPosition?: { left: number; top: number } | null;
  tagId?: string | null;
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
  anchorPosition,
  tagId,
  tagName,
  tagCatalog,
  disabled,
  onTagColorChange,
  onClose,
}: LocalTaskTagColorPickerProps) {
  const { t } = useTranslation();
  const [colorUpdateError, setColorUpdateError] = useState<string | null>(null);
  const [customColorAnchor, setCustomColorAnchor] = useState<HTMLElement | null>(null);
  const [customColorDraft, setCustomColorDraft] = useState("");
  const [customColorHsv, setCustomColorHsv] = useState<HsvColor>(DEFAULT_CUSTOM_COLOR);
  const [isCustomColorInvalid, setIsCustomColorInvalid] = useState(false);
  const [isColorUpdating, setIsColorUpdating] = useState(false);
  const colorTag = useMemo(
    () =>
      tagId
        ? (tagCatalog.find((tag) => tag.id === tagId) ?? null)
        : tagName
          ? (getLocalTaskTagCatalogEntry(tagName, tagCatalog) ?? null)
          : null,
    [tagId, tagName, tagCatalog],
  );
  const isColorPickerOpen = Boolean(anchorEl || anchorPosition);

  useEffect(() => {
    if (!isColorPickerOpen) setCustomColorAnchor(null);
  }, [isColorPickerOpen]);

  const handleColorChange = useCallback(
    async (color: LocalTaskTagColor | null, customColor: LocalTaskTagCustomColor | null = null) => {
      const id = tagId ?? colorTag?.id;
      if (!id || !onTagColorChange || isColorUpdating) return;
      setIsColorUpdating(true);
      setColorUpdateError(null);
      try {
        await onTagColorChange(id, color, customColor);
        setCustomColorAnchor(null);
        onClose();
      } catch (error) {
        setColorUpdateError(getErrorMessage(error));
      } finally {
        setIsColorUpdating(false);
      }
    },
    [colorTag?.id, isColorUpdating, onClose, onTagColorChange, tagId],
  );

  const handleOpenCustomColorEditor = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const initialColor = colorTag?.customColor ?? getHexFromHsv(DEFAULT_CUSTOM_COLOR);
      setCustomColorDraft(initialColor);
      setCustomColorHsv(getHsvFromHex(initialColor) ?? DEFAULT_CUSTOM_COLOR);
      setIsCustomColorInvalid(false);
      setCustomColorAnchor(event.currentTarget);
    },
    [colorTag?.customColor],
  );
  const handleCloseCustomColorEditor = useCallback(() => {
    if (!isColorUpdating) setCustomColorAnchor(null);
  }, [isColorUpdating]);
  const handleApplyCustomColor = useCallback(() => {
    if (!isValidHexColor(customColorDraft)) {
      setIsCustomColorInvalid(true);
      return;
    }
    void handleColorChange(null, customColorDraft.toUpperCase() as LocalTaskTagCustomColor);
  }, [customColorDraft, handleColorChange]);
  const handleCloseColorPicker = useCallback(() => {
    if (isColorUpdating) return;
    setCustomColorAnchor(null);
    onClose();
  }, [isColorUpdating, onClose]);
  const isCustomColorValid = isValidHexColor(customColorDraft);
  const handleCustomColorHsvChange = useCallback((nextColor: HsvColor) => {
    setCustomColorHsv(nextColor);
    setCustomColorDraft(getHexFromHsv(nextColor));
    setIsCustomColorInvalid(false);
  }, []);
  const handleCustomColorHexChange = useCallback((nextColor: string) => {
    setCustomColorDraft(nextColor);
    const parsedColor = getHsvFromHex(nextColor);
    if (parsedColor) setCustomColorHsv(parsedColor);
    setIsCustomColorInvalid(false);
  }, []);

  return (
    <Popover
      anchorEl={anchorEl}
      anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
      anchorPosition={anchorPosition ?? undefined}
      anchorReference={anchorPosition ? "anchorPosition" : "anchorEl"}
      open={isColorPickerOpen}
      transformOrigin={{ horizontal: "left", vertical: "top" }}
      onClose={handleCloseColorPicker}
    >
      <Box
        component="fieldset"
        aria-label={t("localTask.tags.colorPicker", { tag: tagName })}
        sx={{ border: 0, m: 0, p: 1 }}
      >
        {colorUpdateError ? <Alert severity="error">{colorUpdateError}</Alert> : null}
        <Box
          aria-label={t("localTask.tags.presetColors")}
          sx={{ alignItems: "center", display: "flex", gap: 0.75, p: 0.5 }}
        >
          <ColorSwatch
            aria-label={t("localTask.tags.clearColor")}
            isSelected={!colorTag?.color && !colorTag?.customColor}
            disabled={disabled || isColorUpdating}
            onClick={() => void handleColorChange(null)}
          />
          {TAG_COLORS.map((color) => (
            <ColorSwatch
              key={color}
              aria-label={t(`localTask.tags.color.${color}`)}
              color={color}
              isSelected={colorTag?.color === color}
              disabled={disabled || isColorUpdating}
              onClick={() => void handleColorChange(color)}
            />
          ))}
          <Box aria-hidden="true" sx={{ alignSelf: "stretch", borderLeft: 1, borderColor: "divider", mx: 0.5 }} />
          <Box
            aria-expanded={Boolean(customColorAnchor)}
            aria-haspopup="dialog"
            aria-label={t("localTask.tags.customizeColor")}
            component="button"
            disabled={disabled || isColorUpdating}
            type="button"
            sx={colorWheelButtonSx}
            onClick={handleOpenCustomColorEditor}
          >
            {colorTag?.customColor ? "✓" : null}
          </Box>
        </Box>
        <Popover
          anchorEl={customColorAnchor}
          anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
          anchorReference="anchorEl"
          open={Boolean(customColorAnchor)}
          transformOrigin={{ horizontal: "left", vertical: "top" }}
          onClose={handleCloseCustomColorEditor}
        >
          <Box
            aria-label={t("localTask.tags.customizeColor")}
            component="section"
            sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2, width: 380 }}
          >
            {isCustomColorInvalid ? <Alert severity="error">{t("localTask.tags.customColorInvalid")}</Alert> : null}
            <Box sx={{ alignItems: "center", display: "flex", gap: 1.5 }}>
              <Box
                aria-label={t("localTask.tags.customColorPreview")}
                sx={{
                  backgroundColor: isCustomColorValid ? customColorDraft : "transparent",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: "50%",
                  height: 44,
                  width: 44,
                }}
              />
              <Typography color="text.secondary" variant="body2">
                {t("localTask.tags.customColorHex")}
              </Typography>
              <InputBase
                autoFocus
                disabled={disabled || isColorUpdating}
                error={isCustomColorInvalid}
                placeholder={t("localTask.tags.customColorPlaceholder")}
                slotProps={{ input: { "aria-label": t("localTask.tags.customColorInput") } }}
                sx={{ flex: 1, fontFamily: "monospace", fontSize: "1.1rem" }}
                value={customColorDraft}
                onChange={(event) => handleCustomColorHexChange(event.target.value)}
              />
              <Box aria-hidden="true" sx={colorWheelButtonSx} />
            </Box>
            <LocalTaskTagHsvPicker
              disabled={disabled || isColorUpdating}
              hsv={customColorHsv}
              hueLabel={t("localTask.tags.customColorHue")}
              planeLabel={t("localTask.tags.customColorPlane")}
              onChange={handleCustomColorHsvChange}
            />
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <Button size="small" disabled={isColorUpdating} onClick={handleCloseCustomColorEditor}>
                {t("localTask.tags.cancelCustomColor")}
              </Button>
              <Button size="small" disabled={disabled || isColorUpdating} onClick={handleApplyCustomColor}>
                {t("localTask.tags.applyCustomColor")}
              </Button>
            </Box>
          </Box>
        </Popover>
      </Box>
    </Popover>
  );
}

type ColorSwatchProps = {
  "aria-label": string;
  color?: LocalTaskTagColor;
  disabled: boolean;
  isSelected: boolean;
  onClick: () => void;
};

function ColorSwatch({ "aria-label": ariaLabel, color, disabled, isSelected, onClick }: ColorSwatchProps) {
  return (
    <Box
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      component="button"
      disabled={disabled}
      type="button"
      sx={(theme) => ({
        alignItems: "center",
        backgroundColor: color ? getLocalTaskTagColorValue(color, theme) : theme.palette.action.selected,
        border: isSelected ? 0 : 1,
        borderColor: "divider",
        borderRadius: "50%",
        color: theme.palette.common.white,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        height: SWATCH_SIZE,
        justifyContent: "center",
        p: 0,
        width: SWATCH_SIZE,
        "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      })}
      onClick={onClick}
    >
      {isSelected ? "✓" : null}
    </Box>
  );
}

const colorWheelButtonSx = {
  background: COLOR_WHEEL_BACKGROUND,
  border: 0,
  borderRadius: "50%",
  cursor: "pointer",
  flexShrink: 0,
  height: SWATCH_SIZE,
  p: 0,
  width: SWATCH_SIZE,
  "&:disabled": { cursor: "default", opacity: 0.5 },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
} as const;
