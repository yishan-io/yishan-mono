import { Box, Button, ClickAwayListener, List, ListItemButton, ListItemText, Popper, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { FloatingSurface } from "./FloatingSurface";
import { ProviderMark } from "./ProviderMark";
import { SearchInput } from "./SearchInput";
import { type ModelPickerOption, groupModelPickerOptionsByProvider } from "./modelPicker";

type ModelPickerMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  options: ModelPickerOption[];
  selectedModelId: string | null;
  selectedProviderId: string;
  ignoreNextClickAwayRef: MutableRefObject<boolean>;
  onClose: () => void;
  onProviderChange: (providerId: string) => void;
  onModelSelect: (option: ModelPickerOption) => void;
  clearSelectionLabel?: string;
  onClearSelection?: () => void;
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

    color: isSelected ? "primary.main" : "text.secondary",
    bgcolor: isSelected ? "action.selected" : "transparent",
    "&:hover": {
      bgcolor: "action.hover",
    },
  } as const;
}

/** Shared two-column popup model picker with provider navigation and search. */
export function ModelPickerMenu({
  anchorEl,
  open,
  options,
  selectedModelId,
  selectedProviderId,
  ignoreNextClickAwayRef,
  onClose,
  onProviderChange,
  onModelSelect,
  clearSelectionLabel,
  onClearSelection,
}: ModelPickerMenuProps) {
  const { t } = useTranslation();
  const providerGroups = useMemo(() => groupModelPickerOptionsByProvider(options), [options]);
  const activeProviderGroup =
    providerGroups.find((group) => group.providerId === selectedProviderId) ?? providerGroups[0] ?? null;
  const activeProviderKey = activeProviderGroup?.providerId ?? selectedProviderId;
  const activeModels = activeProviderGroup?.models ?? [];
  const searchPlaceholder = useMemo(
    () => t("common.modelPicker.searchPlaceholder", { count: activeModels.length }),
    [activeModels.length, t],
  );
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
        <FloatingSurface
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
          sx={{ overflow: "hidden" }}
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
              <List dense disablePadding aria-label={t("common.modelPicker.providerListLabel")}>
                {providerGroups.map((providerGroup) => (
                  <ListItemButton
                    key={providerGroup.providerId}
                    selected={providerGroup.providerId === activeProviderGroup?.providerId}
                    onClick={() => {
                      onProviderChange(providerGroup.providerId);
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
                      "& .MuiListItemText-secondary": {
                        fontSize: 11,
                        lineHeight: 1.3,
                      },
                    }}
                  >
                    <Box sx={{ mr: 1, flexShrink: 0, display: "inline-flex" }}>
                      <ProviderMark providerId={providerGroup.providerId} size={18} />
                    </Box>
                    <ListItemText
                      primary={providerGroup.providerName}
                      secondary={t("common.modelPicker.providerCount", { count: providerGroup.models.length })}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
            <Box sx={{ width: MODEL_COLUMN_WIDTH_PX, height: DROPDOWN_HEIGHT_PX, py: 0.5 }}>
              <Box sx={{ height: SEARCH_AREA_HEIGHT_PX, px: 1, pb: 0.5 }}>
                <SearchInput
                  value={searchQuery}
                  placeholder={searchPlaceholder}
                  ariaLabel={t("common.modelPicker.searchAriaLabel")}
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
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", px: 1.5, py: 1 }}>
                  {t("common.modelPicker.noModels")}
                </Typography>
              ) : filteredModels.length === 0 ? (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", px: 1.5, py: 1 }}>
                  {t("common.modelPicker.noMatchingModels")}
                </Typography>
              ) : filteredModels.length <= MAX_VISIBLE_MODEL_ROWS ? (
                <Box
                  component="ul"
                  aria-label={`${activeProviderGroup?.providerName ?? selectedProviderId} models`}
                  sx={{ m: 0, p: 0, listStyle: "none", height: MODEL_LIST_HEIGHT_PX, overflowY: "auto" }}
                >
                  {onClearSelection && clearSelectionLabel ? (
                    <Box component="li">
                      <Button fullWidth size="small" onClick={onClearSelection} sx={buildModelButtonSx(selectedModelId === null)}>
                        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {clearSelectionLabel}
                        </Box>
                      </Button>
                    </Box>
                  ) : null}
                  {filteredModels.map((option) => {
                    const isSelected = option.id === selectedModelId;

                    return (
                      <Box key={option.id} component="li">
                        <Button fullWidth size="small" title={option.name} onClick={() => onModelSelect(option)} sx={buildModelButtonSx(isSelected)}>
                          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {option.name}
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
                    aria-label={`${activeProviderGroup?.providerName ?? selectedProviderId} models`}
                    sx={{
                      m: 0,
                      p: 0,
                      listStyle: "none",
                      height: `${virtualizedTotalHeightPx + (onClearSelection && clearSelectionLabel ? MODEL_ROW_HEIGHT_PX : 0)}px`,
                      position: "relative",
                    }}
                  >
                    {onClearSelection && clearSelectionLabel ? (
                      <Box component="li" sx={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                        <Button fullWidth size="small" onClick={onClearSelection} sx={buildModelButtonSx(selectedModelId === null)}>
                          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {clearSelectionLabel}
                          </Box>
                        </Button>
                      </Box>
                    ) : null}
                    {virtualizedModels.map((option, index) => {
                      const isSelected = option.id === selectedModelId;
                      const virtualizedIndex = virtualizedStartIndex + index;
                      const offsetTop = virtualizedIndex * MODEL_ROW_HEIGHT_PX + (onClearSelection && clearSelectionLabel ? MODEL_ROW_HEIGHT_PX : 0);

                      return (
                        <Box
                          key={option.id}
                          component="li"
                          sx={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${offsetTop}px)` }}
                        >
                          <Button fullWidth size="small" title={option.name} onClick={() => onModelSelect(option)} sx={buildModelButtonSx(isSelected)}>
                            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {option.name}
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
        </FloatingSurface>
      </ClickAwayListener>
    </Popper>
  );
}
