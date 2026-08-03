import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import type { AgentModelInfo } from "@renderer/commands/agentCommands";
import { ModelPickerMenu } from "@renderer/components/ModelPickerMenu";
import { ProviderMark } from "@renderer/components/ProviderMark";
import { buildModelPickerOption, groupModelPickerOptionsByProvider } from "@renderer/components/modelPicker";
import type { DesktopAgentKind } from "@renderer/helpers/agentSettings";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { LuChevronDown, LuSparkles } from "react-icons/lu";
import { useAgentModels } from "./useAgentModels";

type TaskRunSectionProps = {
  taskPrompt: string;
  onTaskPromptChange: (prompt: string) => void;
  taskModel: string;
  onTaskModelChange: (model: string) => void;
  isCreatingWorkspace: boolean;
  listAgentModels: (agentKind: DesktopAgentKind) => Promise<{ models?: AgentModelInfo[] }>;
};

function stripProviderPrefix(modelName: string, providerId: string, providerName: string): string {
  const trimmedModelName = modelName.trim();
  const lowerModelName = trimmedModelName.toLowerCase();
  const normalizedPrefixes = [providerId.trim().toLowerCase(), providerName.trim().toLowerCase()].filter(Boolean);

  for (const prefix of normalizedPrefixes) {
    if (lowerModelName.startsWith(`${prefix}/`)) {
      return trimmedModelName.slice(prefix.length + 1).trim() || trimmedModelName;
    }
  }

  return trimmedModelName;
}

function buildTaskRunModelOptions(
  models: AgentModelInfo[],
  selectedModelId: string,
): ReturnType<typeof buildModelPickerOption>[] {
  const options = models.map((model) => {
    const baseOption = buildModelPickerOption({
      id: model.id,
      name: model.name,
    });

    return {
      ...baseOption,
      name: stripProviderPrefix(baseOption.name, baseOption.providerId, baseOption.providerName),
    };
  });

  if (selectedModelId && !options.some((option) => option.id === selectedModelId)) {
    const fallbackOption = buildModelPickerOption({
      id: selectedModelId,
      name: selectedModelId,
    });
    options.unshift({
      ...fallbackOption,
      name: stripProviderPrefix(fallbackOption.name, fallbackOption.providerId, fallbackOption.providerName),
    });
  }

  return options;
}

function getInitialSelectedProvider(
  selectedModelId: string,
  modelOptions: ReturnType<typeof buildTaskRunModelOptions>,
): string {
  if (selectedModelId) {
    return modelOptions.find((option) => option.id === selectedModelId)?.providerId ?? "";
  }

  return groupModelPickerOptionsByProvider(modelOptions)[0]?.providerId ?? "";
}

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
  const modelOptions = useMemo(() => buildTaskRunModelOptions(agentModels, taskModel), [agentModels, taskModel]);
  const providerGroups = useMemo(() => groupModelPickerOptionsByProvider(modelOptions), [modelOptions]);
  const selectedOption = useMemo(
    () => (taskModel ? modelOptions.find((option) => option.id === taskModel) ?? null : null),
    [modelOptions, taskModel],
  );
  const initialSelectedProvider = useMemo(() => getInitialSelectedProvider(taskModel, modelOptions), [modelOptions, taskModel]);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedProvider, setSelectedProvider] = useState(initialSelectedProvider);
  const ignoreNextClickAwayRef = useRef(false);
  const isMenuOpen = Boolean(menuAnchor);
  const activeSelectedProvider = providerGroups.some((providerGroup) => providerGroup.providerId === selectedProvider)
    ? selectedProvider
    : initialSelectedProvider;
  const selectedModelLabel = selectedOption ? `${selectedOption.providerName}/${selectedOption.name}` : null;

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const handleTriggerMouseDown = useCallback(() => {
    ignoreNextClickAwayRef.current = true;
  }, []);

  const handleTriggerClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      setSelectedProvider(initialSelectedProvider);

      if (isMenuOpen) {
        setMenuAnchor(null);
        return;
      }

      setMenuAnchor(event.currentTarget);
    },
    [initialSelectedProvider, isMenuOpen],
  );

  const handleModelSelect = useCallback(
    (option: { id: string; providerId: string }) => {
      onTaskModelChange(option.id);
      setSelectedProvider(option.providerId);
      handleMenuClose();
    },
    [handleMenuClose, onTaskModelChange],
  );

  const handleClearSelection = useCallback(() => {
    onTaskModelChange("");
    handleMenuClose();
  }, [handleMenuClose, onTaskModelChange]);

  useEffect(() => {
    if (!isMenuOpen) {
      ignoreNextClickAwayRef.current = false;
      return;
    }

    const resetIgnoreFlagTimeout = window.setTimeout(() => {
      ignoreNextClickAwayRef.current = false;
    }, 0);

    return () => {
      window.clearTimeout(resetIgnoreFlagTimeout);
    };
  }, [isMenuOpen]);

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            variant="text"
            size="small"
            onMouseDown={handleTriggerMouseDown}
            onClick={handleTriggerClick}
            disabled={isCreatingWorkspace || loadingAgentModels}
            title={selectedModelLabel ?? "Model (optional)"}
            aria-label={selectedModelLabel ?? "Model (optional)"}
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
            endIcon={<LuChevronDown size={14} />}
            sx={{
              width: "100%",
              justifyContent: "flex-start",
              textTransform: "none",
              color: "text.secondary",
              px: 0,
              py: 0,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
              {selectedOption ? (
                <>
                  <ProviderMark providerId={selectedOption.providerId} size={14} />
                  <Box component="span" sx={{ color: "text.secondary", ml: 0.5 }}>
                    {selectedOption.providerName}
                  </Box>
                  <Box component="span" aria-hidden="true" sx={{ mx: 0.75, color: "text.disabled" }}>
                    /
                  </Box>
                  <Box component="span" sx={{ color: "text.primary", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selectedOption.name}
                  </Box>
                </>
              ) : (
                "Model (optional)"
              )}
            </Box>
          </Button>
          <ModelPickerMenu
            key={activeSelectedProvider || "no-provider"}
            anchorEl={menuAnchor}
            open={isMenuOpen}
            options={modelOptions}
            selectedModelId={selectedOption?.id ?? null}
            selectedProviderId={activeSelectedProvider}
            ignoreNextClickAwayRef={ignoreNextClickAwayRef}
            onClose={handleMenuClose}
            onProviderChange={setSelectedProvider}
            onModelSelect={handleModelSelect}
            clearSelectionLabel="Model (optional)"
            onClearSelection={handleClearSelection}
          />
        </Box>
      </Stack>
    </Box>
  );
}
