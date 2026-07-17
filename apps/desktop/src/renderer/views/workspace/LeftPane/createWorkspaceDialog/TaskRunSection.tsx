import { Box, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { AgentModelInfo } from "@renderer/commands/agentCommands";
import { AgentIcon } from "@renderer/components/AgentIcon";
import { ModelAutocomplete } from "@renderer/components/ModelAutocomplete";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "@renderer/helpers/agentSettings";
import { useTranslation } from "react-i18next";
import { LuCpu, LuSparkles } from "react-icons/lu";
import { compactSelectSx } from "../createWorkspaceHelpers";
import { useAgentModels } from "./useAgentModels";

type TaskRunSectionProps = {
  taskAgentKind: DesktopAgentKind | "";
  onTaskAgentKindChange: (agentKind: DesktopAgentKind | "") => void;
  taskPrompt: string;
  onTaskPromptChange: (prompt: string) => void;
  taskModel: string;
  onTaskModelChange: (model: string) => void;
  isCreatingWorkspace: boolean;
  inUseByAgentKind: Record<DesktopAgentKind, boolean>;
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

/** Renders optional task-run fields for workspace creation. */
export function TaskRunSection({
  taskAgentKind,
  onTaskAgentKindChange,
  taskPrompt,
  onTaskPromptChange,
  taskModel,
  onTaskModelChange,
  isCreatingWorkspace,
  inUseByAgentKind,
  listAgentModels,
}: TaskRunSectionProps) {
  const { t } = useTranslation();
  const { agentModels, loadingAgentModels } = useAgentModels({ taskAgentKind, listAgentModels });

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
        <LuSparkles size={14} />
        <Typography variant="caption" color="text.secondary">
          Task run (optional)
        </Typography>
      </Stack>
      <Stack spacing={1.5}>
        <TextField
          select
          size="small"
          fullWidth
          value={taskAgentKind}
          onChange={(event) => onTaskAgentKindChange(event.target.value as DesktopAgentKind | "")}
          sx={compactSelectSx}
          disabled={isCreatingWorkspace}
          slotProps={{
            select: {
              displayEmpty: true,
              renderValue: (value) => {
                const selectedKind = value as DesktopAgentKind | "";
                if (!selectedKind) {
                  return (
                    <Typography variant="body2" color="text.secondary">
                      Agent
                    </Typography>
                  );
                }
                return (
                  <Stack direction="row" alignItems="center" gap={1}>
                    <AgentIcon agentKind={selectedKind} context="settingsRow" decorative />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[selectedKind])}
                    </Typography>
                  </Stack>
                );
              },
            },
          }}
        >
          {SUPPORTED_DESKTOP_AGENT_KINDS.filter((kind) => inUseByAgentKind[kind]).map((kind) => (
            <MenuItem key={kind} value={kind}>
              <Stack direction="row" alignItems="center" gap={1}>
                <AgentIcon agentKind={kind} context="settingsRow" decorative />
                <Typography variant="body2">{t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[kind])}</Typography>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          fullWidth
          value={taskPrompt}
          onChange={(event) => onTaskPromptChange(event.target.value)}
          placeholder="Task description / prompt"
          disabled={isCreatingWorkspace}
          multiline
          minRows={2}
          maxRows={4}
        />
        {taskAgentKind ? (
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
        ) : null}
      </Stack>
    </Box>
  );
}
