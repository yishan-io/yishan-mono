import { Autocomplete, Box, Button, Popper, TextField, Typography } from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";
import type { AgentModel } from "../../store/agentChatTypes";
import { VirtualizedListbox } from "../VirtualizedListbox";

type AgentModelSelectorProps = {
  models: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string;
  onModelChange: (model: AgentModel) => void;
  onThinkingLevelCycle: () => void;
};

const THINKING_LABELS: Record<string, string> = {
  off: "Off",
  minimal: "Min",
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "XHi",
};

const MODEL_SELECTOR_FONT_SIZE_PX = 12;
const MODEL_SELECTOR_LINE_HEIGHT = 1.5;
const MODEL_SELECTOR_MIN_WIDTH_PX = 96;
const MODEL_SELECTOR_HORIZONTAL_PADDING_PX = 24;
const MODEL_SELECTOR_POPUP_ICON_WIDTH_PX = 20;

function formatModelLabel(model: AgentModel): string {
  return model.provider ? `${model.provider}/${model.name}` : model.name;
}

/** Model selector dropdown with thinking level toggle. */
export function AgentModelSelector({
  models,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelCycle,
}: AgentModelSelectorProps) {
  const modelLabel = currentModel ? formatModelLabel(currentModel) : "Select model";
  const longestModelNameLength = Math.max(
    ...models.map((model) => formatModelLabel(model).length),
    modelLabel.length,
    16,
  );
  const popupWidthCh = Math.min(longestModelNameLength + 8, 64);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [triggerWidthPx, setTriggerWidthPx] = useState(MODEL_SELECTOR_MIN_WIDTH_PX);

  useLayoutEffect(() => {
    const element = measureRef.current;
    if (!element) {
      return;
    }
    const measuredWidth = Math.ceil(element.getBoundingClientRect().width);
    const fallbackWidth = Math.ceil(modelLabel.length * MODEL_SELECTOR_FONT_SIZE_PX * 0.65);
    const contentWidth = Math.max(measuredWidth, fallbackWidth);
    setTriggerWidthPx(
      Math.max(
        MODEL_SELECTOR_MIN_WIDTH_PX,
        contentWidth + MODEL_SELECTOR_HORIZONTAL_PADDING_PX + MODEL_SELECTOR_POPUP_ICON_WIDTH_PX,
      ),
    );
  }, [modelLabel]);

  function ContentWidthPopper(props: React.ComponentProps<typeof Popper>) {
    return <Popper {...props} style={{ ...props.style, width: `${popupWidthCh}ch` }} />;
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Box
        component="span"
        ref={measureRef}
        sx={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "pre",
          fontSize: MODEL_SELECTOR_FONT_SIZE_PX,
          lineHeight: MODEL_SELECTOR_LINE_HEIGHT,
          fontFamily: "inherit",
          fontWeight: 400,
          pointerEvents: "none",
        }}
      >
        {modelLabel}
      </Box>
      <Autocomplete
        size="small"
        autoHighlight
        disableClearable
        forcePopupIcon
        ListboxComponent={VirtualizedListbox}
        PopperComponent={ContentWidthPopper}
        options={models}
        value={currentModel ?? undefined}
        onChange={(_, value) => {
          if (value) {
            onModelChange(value);
          }
        }}
        getOptionLabel={(option) => formatModelLabel(option)}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            placeholder="Select model"
            InputProps={{
              ...params.InputProps,
              disableUnderline: true,
            }}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              <Typography variant="body2" noWrap sx={{ fontSize: 12 }}>
                {formatModelLabel(option)}
              </Typography>
            </li>
          );
        }}
        slotProps={{
          paper: {
            sx: {
              minWidth: `${popupWidthCh}ch`,
              maxWidth: "min(64ch, calc(100vw - 32px))",
            },
          },
        }}
        sx={{
          width: `${triggerWidthPx}px`,
          flex: "0 0 auto",
          "& .MuiInputBase-root": {
            width: `${triggerWidthPx}px`,
            minHeight: 0,
            py: 0,
            pr: 2,
            color: "text.secondary",
            fontSize: MODEL_SELECTOR_FONT_SIZE_PX,
          },
          "& .MuiInputBase-input": {
            width: "100%",
            p: 0,
            fontSize: MODEL_SELECTOR_FONT_SIZE_PX,
            lineHeight: MODEL_SELECTOR_LINE_HEIGHT,
          },
          "& .MuiAutocomplete-endAdornment": {
            right: 0,
          },
          "& .MuiSvgIcon-root": {
            fontSize: 16,
          },
        }}
      />
      <Button
        variant="text"
        size="small"
        onClick={onThinkingLevelCycle}
        title={`Thinking: ${thinkingLevel}`}
        sx={{
          minWidth: 0,
          px: 0,
          py: 0,
          fontSize: 12,
          lineHeight: 1.5,
          textTransform: "none",
          color: thinkingLevel === "off" ? "text.disabled" : "text.secondary",
        }}
      >
        Thinking: {THINKING_LABELS[thinkingLevel] ?? thinkingLevel}
      </Button>
    </Box>
  );
}
