import { Box, Button } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import type { AgentModel } from "../../store/agentChatTypes";
import { AgentModelSelectorMenu } from "./AgentModelSelectorMenu";
import {
  formatAgentModelLabel,
  getAgentModelProviderName,
  groupAgentModelsByProvider,
} from "./agentModelSelectorHelpers";

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
const MODEL_SELECTOR_MAX_WIDTH = "min(48ch, calc(100vw - 120px))";

function getInitialSelectedProvider(models: AgentModel[], currentModel: AgentModel | null): string {
  if (currentModel) {
    return getAgentModelProviderName(currentModel);
  }

  return groupAgentModelsByProvider(models)[0]?.provider ?? "";
}

/** Model selector dropdown with thinking level toggle. */
export function AgentModelSelector({
  models,
  currentModel,
  thinkingLevel,
  onModelChange,
  onThinkingLevelCycle,
}: AgentModelSelectorProps) {
  const navigate = useNavigate();
  const modelLabel = currentModel ? formatAgentModelLabel(currentModel) : "Select model";
  const providerLabel = currentModel?.provider?.trim() ?? "";
  const providerGroups = useMemo(() => groupAgentModelsByProvider(models), [models]);
  const initialSelectedProvider = useMemo(
    () => getInitialSelectedProvider(models, currentModel),
    [currentModel, models],
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
    (model: AgentModel) => {
      onModelChange(model);
      setSelectedProvider(getAgentModelProviderName(model));
      handleMenuClose();
    },
    [handleMenuClose, onModelChange],
  );

  const handleAddProvider = useCallback(() => {
    handleMenuClose();
    navigate("/settings?tab=agents&focus=agentProviders");
  }, [handleMenuClose, navigate]);

  const activeSelectedProvider = providerGroups.some((providerGroup) => providerGroup.provider === selectedProvider)
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
          textTransform: "none",
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
              <Box component="span" sx={{ color: "text.secondary" }}>
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
      <AgentModelSelectorMenu
        key={activeSelectedProvider || "no-provider"}
        anchorEl={menuAnchor}
        open={isMenuOpen}
        models={models}
        currentModel={currentModel}
        selectedProvider={activeSelectedProvider}
        ignoreNextClickAwayRef={ignoreNextClickAwayRef}
        onClose={handleMenuClose}
        onProviderChange={setSelectedProvider}
        onModelSelect={handleModelSelect}
        onAddProvider={handleAddProvider}
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
