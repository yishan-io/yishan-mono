import { Box, Button } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { AgentModel } from "../../../../../domains/agent/chat/agentChatTypes";
import { getSupportedThinkingLevels } from "../../../providers/agentThinkingLevels";
import {
  type ModelPickerOption,
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
} from "../../../providers/modelPicker";
import { ProviderMark } from "../../../ui/ProviderMark";
import { ModelPickerMenu } from "../../select-model/ModelPickerMenu";
import { ThinkingLevelControl } from "./ThinkingLevelControl";
import { formatAgentModelLabel } from "./helpers";

type AgentModelSelectorProps = {
  models: AgentModel[];
  currentModel: AgentModel | null;
  thinkingLevel: string;
  onModelChange: (model: AgentModel) => void;
  /** Called with the chosen thinking level from the dropdown menu. */
  onThinkingLevelSelect: (level: string) => void;
  /** Invoked after the popup closes; opens the provider add flow. */
  onAddProvider?: () => void;
};

const MODEL_SELECTOR_FONT_SIZE_PX = 12;
const MODEL_SELECTOR_MAX_WIDTH = "min(48ch, calc(100vw - 120px))";

function getInitialSelectedProvider(
  selectedOptionId: string | null,
  modelOptions: ReturnType<typeof buildAgentModelOptions>,
): string {
  if (selectedOptionId) {
    return modelOptions.find((option) => option.id === selectedOptionId)?.providerId ?? "";
  }

  return groupModelPickerOptionsByProvider(modelOptions)[0]?.providerId ?? "";
}

function buildAgentModelOptions(models: AgentModel[]) {
  return models.map((model) =>
    buildModelPickerOption({
      id: model.id,
      name: model.name,
      providerId: model.provider?.trim(),
    }),
  );
}

/** Model selector dropdown with thinking level picker. */
export function AgentModelSelector({
  models,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelSelect,
  onAddProvider,
}: AgentModelSelectorProps) {
  const modelLabel = currentModel ? formatAgentModelLabel(currentModel) : "Select model";
  const supportedLevels = useMemo(() => getSupportedThinkingLevels(currentModel), [currentModel]);
  const modelOptions = useMemo(() => buildAgentModelOptions(models), [models]);
  const selectedModelId = currentModel?.id ?? null;
  const selectedOption = useMemo(
    () => (selectedModelId ? (modelOptions.find((option) => option.id === selectedModelId) ?? null) : null),
    [modelOptions, selectedModelId],
  );
  const providerLabel = selectedOption?.providerName ?? "";
  const initialSelectedProvider = useMemo(
    () => getInitialSelectedProvider(selectedModelId, modelOptions),
    [modelOptions, selectedModelId],
  );
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedProvider, setSelectedProvider] = useState(initialSelectedProvider);
  const ignoreNextClickAwayRef = useRef(false);
  const isMenuOpen = Boolean(menuAnchor);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const handleTriggerMouseDown = useCallback(() => {
    ignoreNextClickAwayRef.current = true;
  }, []);

  const handleTriggerClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
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
    (model: ModelPickerOption) => {
      const nextModel = models.find((candidateModel) => candidateModel.id === model.id);
      if (!nextModel) {
        return;
      }
      onModelChange(nextModel);
      setSelectedProvider(model.providerId);
      handleMenuClose();
    },
    [handleMenuClose, models, onModelChange],
  );

  const handleAddProvider = useCallback(() => {
    handleMenuClose();
    onAddProvider?.();
  }, [handleMenuClose, onAddProvider]);

  const activeSelectedProvider = groupModelPickerOptionsByProvider(modelOptions).some(
    (providerGroup) => providerGroup.providerId === selectedProvider,
  )
    ? selectedProvider
    : initialSelectedProvider;

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
    <Box sx={{ display: "flex", alignItems: "center", columnGap: 3, rowGap: 1, flexWrap: "wrap" }}>
      <Button
        variant="text"
        size="small"
        title={modelLabel}
        aria-label={modelLabel}
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        endIcon={<LuChevronDown size={14} />}
        onMouseDown={handleTriggerMouseDown}
        onClick={handleTriggerClick}
        sx={{
          maxWidth: MODEL_SELECTOR_MAX_WIDTH,
          minWidth: 0,
          px: 0,
          py: 0,
          fontSize: MODEL_SELECTOR_FONT_SIZE_PX,
          lineHeight: 1.5,

          color: "text.secondary",
        }}
      >
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {providerLabel ? (
            <>
              <ProviderMark providerId={selectedOption?.providerId ?? providerLabel} size={14} />
              <Box component="span" sx={{ color: "text.secondary", ml: 0.5 }}>
                {providerLabel}
              </Box>
              <Box component="span" aria-hidden="true" sx={{ mx: 0.75, color: "text.disabled" }}>
                /
              </Box>
              <Box component="span" sx={{ color: "text.primary" }}>
                {currentModel?.name}
              </Box>
            </>
          ) : (
            modelLabel
          )}
        </Box>
      </Button>
      <ModelPickerMenu
        key={activeSelectedProvider || "no-provider"}
        anchorEl={menuAnchor}
        open={isMenuOpen}
        options={modelOptions}
        selectedModelId={selectedModelId}
        selectedProviderId={activeSelectedProvider}
        ignoreNextClickAwayRef={ignoreNextClickAwayRef}
        onClose={handleMenuClose}
        onProviderChange={setSelectedProvider}
        onModelSelect={handleModelSelect}
        onAddProvider={onAddProvider ? handleAddProvider : undefined}
      />
      <ThinkingLevelControl
        thinkingLevel={thinkingLevel}
        onSelect={onThinkingLevelSelect}
        supportedLevels={supportedLevels}
      />
    </Box>
  );
}
