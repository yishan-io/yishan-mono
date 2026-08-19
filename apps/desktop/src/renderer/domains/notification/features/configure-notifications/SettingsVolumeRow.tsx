import { Box, Slider, Typography } from "@mui/material";
import { useRef } from "react";
import { IoVolumeHigh, IoVolumeLow } from "react-icons/io5";

const SETTINGS_VOLUME_ROW_LAYOUT = {
  minHeight: 56,
} as const;

const VOLUME_MARKS = Array.from({ length: 11 }, (_unused, index) => ({
  value: index * 10,
}));

/**
 * Quantizes one slider percentage to the 0-100 range using 5-point increments.
 */
function normalizeSliderPercent(value: number): number {
  const clampedValue = Math.min(100, Math.max(0, value));
  return Math.round(clampedValue / 5) * 5;
}

/**
 * Resolves one horizontal pointer click into a percentage value for the volume slider.
 */
function resolveSliderPercentFromMouse(input: { clientX: number; left: number; width: number }): number {
  if (!Number.isFinite(input.width) || input.width <= 0) {
    return 0;
  }

  const ratio = (input.clientX - input.left) / input.width;
  return normalizeSliderPercent(ratio * 100);
}

export type SettingsVolumeRowProps = {
  title: string;
  valuePercent: number;
  disabled?: boolean;
  onChange: (nextValuePercent: number) => void;
  onChangeCommitted: (nextValuePercent: number) => void;
};

/**
 * Renders one standardized volume-slider settings row with low/high volume icons.
 */
export function SettingsVolumeRow({
  title,
  valuePercent,
  disabled,
  onChange,
  onChangeCommitted,
}: SettingsVolumeRowProps) {
  const sliderClickZoneRef = useRef<HTMLDivElement | null>(null);

  return (
    <Box sx={{ py: 0, minHeight: SETTINGS_VOLUME_ROW_LAYOUT.minHeight, display: "flex", alignItems: "center" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, width: "100%" }}>
        <Box sx={{ flex: 1, pr: 2, minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {title}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, width: "clamp(130px, 30%, 260px)" }}>
          <Box
            aria-hidden="true"
            sx={{ color: "text.secondary", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <IoVolumeLow size={18} />
          </Box>
          <Box
            ref={sliderClickZoneRef}
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              py: 1.25,
              my: -1.25,
              cursor: disabled ? "default" : "pointer",
            }}
            onMouseDown={(event) => {
              if (disabled || event.button !== 0) {
                return;
              }

              const target = event.target as HTMLElement;
              if (target.closest(".MuiSlider-root") || target.closest(".MuiSlider-thumb")) {
                return;
              }

              const sliderClickZoneElement = sliderClickZoneRef.current;
              if (!sliderClickZoneElement) {
                return;
              }

              const rect = sliderClickZoneElement.getBoundingClientRect();
              const nextValue = resolveSliderPercentFromMouse({
                clientX: event.clientX,
                left: rect.left,
                width: rect.width,
              });
              onChange(nextValue);
              onChangeCommitted(nextValue);
            }}
          >
            <Slider
              value={valuePercent}
              disabled={disabled}
              onChange={(_event, value) => {
                const nextValue = Array.isArray(value) ? (value[0] ?? 0) : value;
                onChange(nextValue);
              }}
              onChangeCommitted={(_event, value) => {
                const nextValue = Array.isArray(value) ? (value[0] ?? 0) : value;
                onChangeCommitted(nextValue);
              }}
              min={0}
              max={100}
              step={5}
              marks={VOLUME_MARKS}
              sx={{
                py: 0,
                "& .MuiSlider-rail": {
                  backgroundColor: "divider",
                  opacity: 1,
                  height: 4,
                },
                "& .MuiSlider-track": {
                  backgroundColor: "divider",
                  border: "none",
                  height: 4,
                },
                "& .MuiSlider-thumb": {
                  width: 16,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: "common.white",
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  boxShadow: "none",
                  "&:hover, &.Mui-focusVisible, &.Mui-active": {
                    boxShadow: "none",
                  },
                },
                "& .MuiSlider-mark": {
                  width: 2,
                  height: 14,
                  borderRadius: 1,
                  backgroundColor: "divider",
                  top: "50%",
                  transform: "translateY(-50%)",
                },
                "& .MuiSlider-markLabel": {
                  display: "none",
                },
              }}
            />
          </Box>
          <Box
            aria-hidden="true"
            sx={{ color: "text.secondary", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <IoVolumeHigh size={18} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
