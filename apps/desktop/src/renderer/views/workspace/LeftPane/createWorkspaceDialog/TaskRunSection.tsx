import { Box, Stack, TextField, Typography } from "@mui/material";
import type { AgentModelInfo } from "@renderer/commands/agentCommands";
import { ModelAutocomplete } from "@renderer/components/ModelAutocomplete";
import type { DesktopAgentKind } from "@renderer/helpers/agentSettings";
import { LuCpu, LuSparkles } from "react-icons/lu";
import { useAgentModels } from "./useAgentModels";

type TaskRunSectionProps = {
  taskPrompt: string;
  onTaskPromptChange: (prompt: string) => void;
  taskModel: string;
  onTaskModelChange: (model: string) => void;
  isCreatingWorkspace: boolean;
  listAgentModels: (agentKind: DesktopAgentKind) => Promise<{ models?: AgentModelInfo[] }>;
};

const modelAutocompleteSx = {
  width: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: 2.5,
    backgroundColor: "action.hover",
    minHeight: 36,
  },
  "& .MuiOutlinedInput-root fieldset": {
    borderColor: "transparent",
  },
  "& .MuiOutlinedInput-root:hover fieldset": {
    borderColor: "transparent",
  },
  "& .MuiOutlinedInput-root.Mui-focused fieldset": {
    borderColor: "divider",
  },
  "& .MuiOutlinedInput-input": {
    py: 0.5,
  },
} as const;

/** Renders optional Pi task-run fields for workspace creation. */
export function TaskRunSection({
  taskPrompt,
  onTaskPromptChange,
  taskModel,
  onTaskModelChange,
  isCreatingWorkspace,
  listAgentModels,
}: TaskRunSectionProps) {
  const { agentModels, loadingAgentModels } = useAgentModels({ taskAgentKind: "pi", listAgentModels });

  return (
    <Box>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          gap: 0.75,
          mb: 0.5,
        }}
      >
        <LuSparkles size={14} />
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
          }}
        >
          Task run (optional)
        </Typography>
      </Stack>
      <Stack spacing={1.5}>
        <TextField
          fullWidth
          value={taskPrompt}
          onChange={(event) => onTaskPromptChange(event.target.value)}
          placeholder="Task description / prompt"
          disabled={isCreatingWorkspace}
          multiline
          minRows={2}
          maxRows={4}
        />
        <ModelAutocomplete
          options={agentModels}
          value={taskModel}
          onChange={onTaskModelChange}
          loading={loadingAgentModels}
          disabled={isCreatingWorkspace}
          placeholder="Model (optional)"
          startAdornment={<LuCpu size={14} />}
          sx={modelAutocompleteSx}
        />
      </Stack>
    </Box>
  );
}
