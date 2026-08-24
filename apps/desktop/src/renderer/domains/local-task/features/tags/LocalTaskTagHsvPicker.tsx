import { Box, Slider } from "@mui/material";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HsvColor } from "./localTaskTagColorHsv";
import { getHexFromHsv } from "./localTaskTagColorHsv";

type LocalTaskTagHsvPickerProps = {
  hsv: HsvColor;
  disabled: boolean;
  hueLabel: string;
  planeLabel: string;
  onChange: (nextColor: HsvColor) => void;
};

const HUE_RAIL_BACKGROUND =
  "linear-gradient(to top, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))";

const KEYBOARD_STEP = 1;
const MAX_PERCENT = 100;

/** Renders a keyboard- and pointer-accessible HSV saturation/value color plane with a hue control. */
export function LocalTaskTagHsvPicker({ hsv, disabled, hueLabel, planeLabel, onChange }: LocalTaskTagHsvPickerProps) {
  const planeRef = useRef<HTMLFieldSetElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const plane = planeRef.current;
      if (!plane) return;

      const planeRect = plane.getBoundingClientRect();
      if (planeRect.width <= 0 || planeRect.height <= 0) return;
      const saturation = Math.round(((clientX - planeRect.left) / planeRect.width) * MAX_PERCENT);
      const value = Math.round((1 - (clientY - planeRect.top) / planeRect.height) * MAX_PERCENT);
      onChange({ ...hsv, saturation: clampPercent(saturation), value: clampPercent(value) });
    },
    [hsv, onChange],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => updateFromPointer(event.clientX, event.clientY);
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updateFromPointer]);

  const handlePlaneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLFieldSetElement>) => {
      const nextColor = getNextColorForKey(event.key, hsv);
      if (!nextColor) return;
      event.preventDefault();
      onChange(nextColor);
    },
    [hsv, onChange],
  );
  const handleHueChange = useCallback(
    (_event: Event, nextValue: number | number[]) => {
      const hue = Array.isArray(nextValue) ? (nextValue[0] ?? 0) : nextValue;
      onChange({ ...hsv, hue });
    },
    [hsv, onChange],
  );

  return (
    <Box sx={{ alignItems: "stretch", display: "flex", gap: 2 }}>
      <Box
        ref={planeRef}
        aria-label={planeLabel}
        aria-valuetext={`${hsv.saturation}% saturation, ${hsv.value}% value`}
        component="fieldset"
        tabIndex={disabled ? -1 : 0}
        sx={{
          backgroundColor: getHexFromHsv({ hue: hsv.hue, saturation: MAX_PERCENT, value: MAX_PERCENT }),
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 1), rgb(255 255 255 / 0)), linear-gradient(to top, rgb(0 0 0 / 1), rgb(0 0 0 / 0))",
          borderRadius: 0.5,
          cursor: disabled ? "default" : "crosshair",
          flex: 1,
          height: 200,
          minWidth: 280,
          outline: 0,
          position: "relative",
          touchAction: "none",
          "&:focus-visible": { boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}` },
        }}
        onKeyDown={handlePlaneKeyDown}
        onMouseDown={(event) => {
          if (disabled || event.button !== 0) return;
          updateFromPointer(event.clientX, event.clientY);
          setIsDragging(true);
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            border: 2,
            borderColor: "common.white",
            borderRadius: "50%",
            boxShadow: (theme) => `0 0 0 1px ${theme.palette.common.black}`,
            height: 14,
            left: `${hsv.saturation}%`,
            pointerEvents: "none",
            position: "absolute",
            top: `${MAX_PERCENT - hsv.value}%`,
            transform: "translate(-50%, -50%)",
            width: 14,
          }}
        />
      </Box>
      <Slider
        aria-label={hueLabel}
        disabled={disabled}
        max={360}
        orientation="vertical"
        min={0}
        step={1}
        value={hsv.hue}
        sx={{
          background: HUE_RAIL_BACKGROUND,
          borderRadius: 1,
          color: "transparent",
          height: 200,
          px: 0,
          "& .MuiSlider-rail, & .MuiSlider-track": { display: "none" },
          "& .MuiSlider-thumb": { backgroundColor: "common.white", border: 1, borderColor: "common.black" },
        }}
        onChange={handleHueChange}
      />
    </Box>
  );
}

function clampPercent(percent: number): number {
  return Math.min(MAX_PERCENT, Math.max(0, percent));
}

function getNextColorForKey(key: string, hsv: HsvColor): HsvColor | null {
  if (key === "ArrowLeft") return { ...hsv, saturation: clampPercent(hsv.saturation - KEYBOARD_STEP) };
  if (key === "ArrowRight") return { ...hsv, saturation: clampPercent(hsv.saturation + KEYBOARD_STEP) };
  if (key === "ArrowDown") return { ...hsv, value: clampPercent(hsv.value - KEYBOARD_STEP) };
  if (key === "ArrowUp") return { ...hsv, value: clampPercent(hsv.value + KEYBOARD_STEP) };
  if (key === "Home") return { ...hsv, saturation: 0, value: 0 };
  if (key === "End") return { ...hsv, saturation: MAX_PERCENT, value: MAX_PERCENT };
  return null;
}
