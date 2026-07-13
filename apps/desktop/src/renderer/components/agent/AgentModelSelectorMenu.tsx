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
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { LuPlus } from "react-icons/lu";
import type { AgentModel } from "../../store/agentChatTypes";
import { SearchInput } from "../SearchInput";
import { groupAgentModelsByProvider } from "./agentModelSelectorHelpers";

type AgentModelSelectorMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  models: AgentModel[];
  currentModel: AgentModel | null;
  selectedProvider: string;
  ignoreNextClickAwayRef: MutableRefObject<boolean>;
  onClose: () => void;
  onProviderChange: (provider: string) => void;
  onModelSelect: (model: AgentModel) => void;
  onAddProvider: () => void;
};

const PROVIDER_COLUMN_WIDTH_PX = 156;
const MODEL_COLUMN_WIDTH_PX = 280;
const MODEL_ROW_HEIGHT_PX = 32;
const MODEL_OVERSCAN_ROWS = 5;
const DROPDOWN_HEIGHT_PX = 320;
const SEARCH_AREA_HEIGHT_PX = 40;
const MODEL_LIST_HEIGHT_PX = DROPDOWN_HEIGHT_PX - SEARCH_AREA_HEIGHT_PX;
const MAX_VISIBLE_MODEL_ROWS = 8;

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

function getProviderIconLabel(provider: string): string {
  const trimmedProvider = provider.trim();

  if (!trimmedProvider) {
    return "?";
  }

  return trimmedProvider[0]?.toUpperCase() ?? "?";
}

/** Two-column model picker with provider navigation and a virtualized model list. */
export function AgentModelSelectorMenu({
  anchorEl,
  open,
  models,
  currentModel,
  selectedProvider,
  ignoreNextClickAwayRef,
  onClose,
  onProviderChange,
  onModelSelect,
  onAddProvider,
}: AgentModelSelectorMenuProps) {
  const { t } = useTranslation();
  const providerGroups = useMemo(() => groupAgentModelsByProvider(models), [models]);
  const activeProviderGroup =
    providerGroups.find((group) => group.provider === selectedProvider) ?? providerGroups[0] ?? null;
  const activeProviderKey = activeProviderGroup?.provider ?? selectedProvider;
  const activeModels = activeProviderGroup?.models ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const filteredModels = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return activeModels;
    }

    return activeModels.filter((model) => model.name.toLowerCase().includes(normalizedQuery));
  }, [activeModels, searchQuery]);
  const modelListRef = useRef<HTMLDivElement | null>(null);
  const previousProviderKeyRef = useRef(activeProviderKey);
  const [scrollTop, setScrollTop] = useState(0);
  const visibleItemCount = Math.ceil(MODEL_LIST_HEIGHT_PX / MODEL_ROW_HEIGHT_PX);
  const virtualizedStartIndex = Math.max(0, Math.floor(scrollTop / MODEL_ROW_HEIGHT_PX) - MODEL_OVERSCAN_ROWS);
  const virtualizedEndIndex = Math.min(
    filteredModels.length,
    virtualizedStartIndex + visibleItemCount + MODEL_OVERSCAN_ROWS * 2,
  );
  const virtualizedModels = filteredModels.slice(virtualizedStartIndex, virtualizedEndIndex);
  const virtualizedTotalHeightPx = filteredModels.length * MODEL_ROW_HEIGHT_PX;

  useEffect(() => {
    const providerChanged = previousProviderKeyRef.current !== activeProviderKey;
    previousProviderKeyRef.current = activeProviderKey;

    if (!open) {
      setSearchQuery("");
      setScrollTop(0);
      return;
    }

    if (providerChanged || modelListRef.current) {
      if (modelListRef.current) {
        modelListRef.current.scrollTop = 0;
      }
      setScrollTop(0);
    }
  }, [activeProviderKey, open]);

  return (
    <Popper open={open} anchorEl={anchorEl} placement="bottom-start" sx={{ zIndex: 1300, mt: 0.5 }}>
      <ClickAwayListener
        onClickAway={(event) => {
          if (ignoreNextClickAwayRef.current) {
            ignoreNextClickAwayRef.current = false;
            return;
          }

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
                display: "flex",
                flexDirection: "column",
                borderRight: 1,
                borderColor: "divider",
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 0.5 }}>
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
                      <Box
                        component="span"
                        aria-hidden="true"
                        sx={{
                          width: 18,
                          height: 18,
                          mr: 1,
                          borderRadius: "50%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          bgcolor:
                            providerGroup.provider === activeProviderGroup?.provider ? "primary.main" : "action.hover",
                          color:
                            providerGroup.provider === activeProviderGroup?.provider
                              ? "primary.contrastText"
                              : "text.secondary",
                          fontSize: 10,
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {getProviderIconLabel(providerGroup.provider)}
                      </Box>
                      <ListItemText primary={providerGroup.provider} />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
              <ListItemButton
                onClick={onAddProvider}
                sx={{
                  minHeight: MODEL_ROW_HEIGHT_PX,
                  flexGrow: 0,
                  flexShrink: 0,
                  px: 1.5,
                  py: 0.5,
                  borderTop: 1,
                  borderColor: "divider",
                  color: "primary.main",
                  "& .MuiListItemText-primary": {
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <LuPlus size={16} aria-hidden="true" />
                <ListItemText primary={t("agentChat.modelSelector.addProvider")} sx={{ ml: 1 }} />
              </ListItemButton>
            </Box>
            <Box sx={{ width: MODEL_COLUMN_WIDTH_PX, height: DROPDOWN_HEIGHT_PX, py: 0.5 }}>
              <Box sx={{ height: SEARCH_AREA_HEIGHT_PX, px: 1, pb: 0.5 }}>
                <SearchInput
                  value={searchQuery}
                  placeholder="Search models"
                  ariaLabel="Search models"
                  sizeVariant="small"
                  onChange={(value) => {
                    if (modelListRef.current) {
                      modelListRef.current.scrollTop = 0;
                    }
                    setScrollTop(0);
                    setSearchQuery(value);
                  }}
                />
              </Box>
              {activeModels.length === 0 ? (
                <Typography color="text.secondary" variant="caption" sx={{ display: "block", px: 1.5, py: 1 }}>
                  No models
                </Typography>
              ) : filteredModels.length === 0 ? (
                <Typography color="text.secondary" variant="caption" sx={{ display: "block", px: 1.5, py: 1 }}>
                  No matching models
                </Typography>
              ) : filteredModels.length <= MAX_VISIBLE_MODEL_ROWS ? (
                <Box
                  component="ul"
                  aria-label={`${activeProviderGroup?.provider ?? selectedProvider} models`}
                  sx={{ m: 0, p: 0, listStyle: "none", height: MODEL_LIST_HEIGHT_PX, overflowY: "auto" }}
                >
                  {filteredModels.map((model) => {
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
                  sx={{ height: MODEL_LIST_HEIGHT_PX, overflowY: "auto", overflowX: "hidden" }}
                  onScroll={(event) => {
                    setScrollTop(event.currentTarget.scrollTop);
                  }}
                >
                  <Box
                    component="ul"
                    aria-label={`${activeProviderGroup?.provider ?? selectedProvider} models`}
                    sx={{
                      m: 0,
                      p: 0,
                      listStyle: "none",
                      height: `${virtualizedTotalHeightPx}px`,
                      position: "relative",
                    }}
                  >
                    {virtualizedModels.map((model, index) => {
                      const isSelected = model.id === currentModel?.id;
                      const virtualizedIndex = virtualizedStartIndex + index;

                      return (
                        <Box
                          key={model.id}
                          component="li"
                          sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            transform: `translateY(${virtualizedIndex * MODEL_ROW_HEIGHT_PX}px)`,
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
