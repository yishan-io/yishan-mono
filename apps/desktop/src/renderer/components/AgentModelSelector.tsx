import { Autocomplete, Box, IconButton, TextField, Typography } from "@mui/material";
import type { AgentModel } from "../store/agentChatTypes";

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

/** Model selector dropdown with thinking level toggle. */
export function AgentModelSelector({
  models,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelCycle,
}: AgentModelSelectorProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Autocomplete
        size="small"
        options={models}
        value={currentModel ?? undefined}
        onChange={(_, value) => {
          if (value) onModelChange(value);
        }}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderInput={(params) => (
          <TextField {...params} label="Model" variant="outlined" size="small" />
        )}
        sx={{ minWidth: 200, maxWidth: 300 }}
        disableClearable
      />
      <IconButton
        size="small"
        onClick={onThinkingLevelCycle}
        title={`Thinking: ${thinkingLevel}`}
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          px: 1,
          typography: "caption",
          color: thinkingLevel === "off" ? "text.disabled" : "primary.main",
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {THINKING_LABELS[thinkingLevel] ?? thinkingLevel}
        </Typography>
      </IconButton>
    </Box>
  );
}
