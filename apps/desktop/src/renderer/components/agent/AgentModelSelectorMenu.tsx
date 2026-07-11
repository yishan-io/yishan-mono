import {
  Box,
  Button,
  ClickAwayListener,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Popper,
  Typography,
} from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import type { AgentModel } from "../../store/agentChatTypes";
import { groupAgentModelsByProvider } from "./agentModelSelectorHelpers";

type AgentModelSelectorMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  models: AgentModel[];
  currentModel: AgentModel | null;
  selectedProvider: string;
  onClose: () => void;
  onProviderChange: (provider: string) => void;
  onModelSelect: (model: AgentModel) => void;
};

const PROVIDER_COLUMN_WIDTH_PX = 156;
const MODEL_COLUMN_WIDTH_PX = 280;
const MODEL_ROW_HEIGHT_PX = 32;
const MAX_VISIBLE_MODEL_ROWS = 8;
const MODEL_OVERSCAN_ROWS = 5;
const DROPDOWN_HEIGHT_PX = MAX_VISIBLE_MODEL_ROWS * MODEL_ROW_HEIGHT_PX;

function buildModelButtonSx(isSelected: boolean) {
  return {
    justifyContent: "flex-start",
    minHeight: MODEL_ROW_HEIGHT_PX,
    px: 1.5,
    py: 0.25,
    borderRadius: 0,
    fontSize: 12,
    lineHeight: 1.5,
    textTransform: "none",
    color: isSelected ? "primary.main" : "text.secondary",
    bgcolor: isSelected ? "action.selected" : "transparent",
    "&:hover": {
      bgcolor: "action.hover",
    },
  } as const;
}

/** Two-column model picker with provider navigation and a virtualized model list. */
export function AgentModelSelectorMenu({
  anchorEl,
  open,
  models,
  currentModel,
  selectedProvider,
  onClose,
  onProviderChange,
  onModelSelect,
}: AgentModelSelectorMenuProps) {
  const providerGroups = useMemo(() => groupAgentModelsByProvider(models), [models]);
  const activeProviderGroup =
    providerGroups.find((group) => group.provider === selectedProvider) ?? providerGroups[0] ?? null;
  const activeModels = activeProviderGroup?.models ?? [];
  const modelListRef = useRef<HTMLDivElement | null>(null);

  const modelVirtualizer = useVirtualizer({
    count: activeModels.length,
    getScrollElement: () => modelListRef.current,
    estimateSize: () => MODEL_ROW_HEIGHT_PX,
    overscan: MODEL_OVERSCAN_ROWS,
    initialRect: {
      width: MODEL_COLUMN_WIDTH_PX,
      height: DROPDOWN_HEIGHT_PX,
    },
  });

  useEffect(() => {
    if (modelListRef.current) {
      modelListRef.current.scrollTop = 0;
    }

    modelVirtualizer.scrollToOffset(0);
    modelVirtualizer.measure();
  }, [modelVirtualizer]);

  return (
    <Popper open={open} anchorEl={anchorEl} placement="bottom-start" sx={{ zIndex: 1300, mt: 0.5 }}>
      <ClickAwayListener
        onClickAway={(event) => {
          const clickTarget = event.target;
          if (anchorEl && clickTarget instanceof Node && anchorEl.contains(clickTarget)) {
            return;
          }
          onClose();
        }}
      >
        <Paper
          elevation={3}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
          sx={{
            overflow: "hidden",
            bgcolor: "background.default",
            border: (theme) => `1px solid ${theme.palette.divider}`,
            backgroundImage: "none",
          }}
        >
          <Box sx={{ display: "flex", height: DROPDOWN_HEIGHT_PX, maxWidth: "calc(100vw - 32px)" }}>
            <Box
              sx={{
                width: PROVIDER_COLUMN_WIDTH_PX,
                height: DROPDOWN_HEIGHT_PX,
                overflowY: "auto",
                borderRight: 1,
                borderColor: "divider",
                py: 0.5,
              }}
            >
              <List dense disablePadding aria-label="Model providers">
                {providerGroups.map((providerGroup) => (
                  <ListItemButton
                    key={providerGroup.provider}
                    selected={providerGroup.provider === activeProviderGroup?.provider}
                    onClick={() => {
                      onProviderChange(providerGroup.provider);
                    }}
                    sx={{
                      minHeight: MODEL_ROW_HEIGHT_PX,
                      px: 1.5,
                      py: 0.25,
                      "& .MuiListItemText-primary": {
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      },
                    }}
                  >
                    <ListItemText primary={providerGroup.provider} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
            <Box sx={{ width: MODEL_COLUMN_WIDTH_PX, height: DROPDOWN_HEIGHT_PX, py: 0.5 }}>
              {activeModels.length === 0 ? (
                <Typography color="text.secondary" variant="caption" sx={{ display: "block", px: 1.5, py: 1 }}>
                  No models
                </Typography>
              ) : activeModels.length <= MAX_VISIBLE_MODEL_ROWS ? (
                <Box
                  component="ul"
                  aria-label={`${activeProviderGroup?.provider ?? selectedProvider} models`}
                  sx={{ m: 0, p: 0, listStyle: "none", height: DROPDOWN_HEIGHT_PX, overflowY: "auto" }}
                >
                  {activeModels.map((model) => {
                    const isSelected = model.id === currentModel?.id;

                    return (
                      <Box key={model.id} component="li">
                        <Button
                          fullWidth
                          size="small"
                          title={model.name}
                          onClick={() => {
                            onModelSelect(model);
                          }}
                          sx={buildModelButtonSx(isSelected)}
                        >
                          <Box
                            component="span"
                            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {model.name}
                          </Box>
                        </Button>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box
                  ref={modelListRef}
                  component="ul"
                  aria-label={`${activeProviderGroup?.provider ?? selectedProvider} models`}
                  sx={{
                    m: 0,
                    p: 0,
                    listStyle: "none",
                    height: DROPDOWN_HEIGHT_PX,
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <Box sx={{ height: `${modelVirtualizer.getTotalSize()}px`, position: "relative" }}>
                    {modelVirtualizer.getVirtualItems().map((virtualItem) => {
                      const model = activeModels[virtualItem.index];

                      if (!model) {
                        return null;
                      }

                      const isSelected = model.id === currentModel?.id;

                      return (
                        <Box
                          key={model.id}
                          component="li"
                          sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <Button
                            fullWidth
                            size="small"
                            title={model.name}
                            onClick={() => {
                              onModelSelect(model);
                            }}
                            sx={buildModelButtonSx(isSelected)}
                          >
                            <Box
                              component="span"
                              sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {model.name}
                            </Box>
                          </Button>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
