import { Alert, Box, Button, Stack } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown } from "react-icons/lu";
import { ModelPickerMenu } from "../../../components/ModelPickerMenu";
import { ProviderMark } from "../../../components/ProviderMark";
import {
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
  stripProviderPrefix,
} from "../../../components/modelPicker";
import {
  SettingsCard,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
  SettingsToggleRow,
} from "../../../components/settings";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import {
  getMemoryConfig,
  listAgentModelsForMemorySettings,
  updateMemoryConfig,
} from "../../../features/settings/commands/settingsCommands";
import type { MemoryConfig } from "../../../rpc/daemonTypes";


const MEMORY_SUMMARIZER_AGENT_KIND = "pi" as const;

function normalizeMemoryConfig(config: MemoryConfig): MemoryConfig {
  const normalizedAgentKind = config.agentKind.trim();
  const model =
    normalizedAgentKind.length > 0 && normalizedAgentKind !== MEMORY_SUMMARIZER_AGENT_KIND ? "" : config.model;

  return {
    ...config,
    agentKind: MEMORY_SUMMARIZER_AGENT_KIND,
    model,
  };
}

function buildMemoryModelOptions(
  models: Array<{ id: string; name: string }>,
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
  modelOptions: ReturnType<typeof buildMemoryModelOptions>,
): string {
  if (selectedModelId) {
    return modelOptions.find((option) => option.id === selectedModelId)?.providerId ?? "";
  }

  return groupModelPickerOptionsByProvider(modelOptions)[0]?.providerId ?? "";
}

export function MemorySettingsView() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("");
  const ignoreNextClickAwayRef = useRef(false);
  const modelsRequestIdRef = useRef(0);

  const fetchModels = useCallback(async (forceRefresh = false) => {
    const requestId = modelsRequestIdRef.current + 1;
    modelsRequestIdRef.current = requestId;

    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await listAgentModelsForMemorySettings(
        forceRefresh
          ? { agentKind: MEMORY_SUMMARIZER_AGENT_KIND, forceRefresh: true }
          : { agentKind: MEMORY_SUMMARIZER_AGENT_KIND },
      );
      if (modelsRequestIdRef.current !== requestId) {
        return;
      }
      setModels(result.models ?? []);
    } catch (error) {
      if (modelsRequestIdRef.current !== requestId) {
        return;
      }
      setModelsError(getErrorMessage(error));
      setModels([]);
    } finally {
      if (modelsRequestIdRef.current === requestId) {
        setModelsLoading(false);
      }
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const nextConfig = normalizeMemoryConfig(await getMemoryConfig());
      setConfig(nextConfig);
      setSaveError(null);
      fetchModels();
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [fetchModels]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const persistConfig = useCallback(async (next: MemoryConfig) => {
    const normalizedNext = normalizeMemoryConfig(next);
    setConfig(normalizedNext);
    try {
      await updateMemoryConfig(normalizedNext);
      setSaveError(null);
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  }, []);

  const handleEnabledChange = useCallback(
    (checked: boolean) => {
      if (!config) return;
      persistConfig({ ...config, enabled: checked });
    },
    [config, persistConfig],
  );

  const modelValue = config?.model ?? "";
  const modelOptions = useMemo(() => buildMemoryModelOptions(models, modelValue), [modelValue, models]);
  const providerGroups = useMemo(() => groupModelPickerOptionsByProvider(modelOptions), [modelOptions]);
  const selectedOption = useMemo(
    () => (modelValue ? (modelOptions.find((option) => option.id === modelValue) ?? null) : null),
    [modelOptions, modelValue],
  );
  const initialSelectedProvider = useMemo(
    () => getInitialSelectedProvider(modelValue, modelOptions),
    [modelOptions, modelValue],
  );
  const activeSelectedProvider = providerGroups.some((providerGroup) => providerGroup.providerId === selectedProvider)
    ? selectedProvider
    : initialSelectedProvider;
  const isMenuOpen = Boolean(menuAnchor);
  const selectedModelLabel = selectedOption ? `${selectedOption.providerName}/${selectedOption.name}` : null;

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
    (option: { id: string; providerId: string }) => {
      if (!config) {
        return;
      }
      void persistConfig({ ...config, model: option.id });
      setSelectedProvider(option.providerId);
      handleMenuClose();
    },
    [config, handleMenuClose, persistConfig],
  );

  const handleClearSelection = useCallback(() => {
    if (!config) {
      return;
    }
    void persistConfig({ ...config, model: "" });
    handleMenuClose();
  }, [config, handleMenuClose, persistConfig]);

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
    <Stack spacing={2} data-testid="memory-settings-panel">
      <Box>
        <SettingsSectionHeader title={t("settings.memory.title")} description={t("settings.memory.description")} />
        <SettingsCard>
          <SettingsRows>
            <SettingsToggleRow
              title={t("settings.memory.summarizer.enabled.label")}
              description={t("settings.memory.summarizer.enabled.description")}
              checked={config?.enabled ?? false}
              disabled={loading}
              onChange={handleEnabledChange}
            />
          </SettingsRows>
        </SettingsCard>
      </Box>

      {config?.enabled ? (
        <Box>
          <SettingsSectionHeader
            title={t("settings.memory.summarizer.title")}
            description={t("settings.memory.summarizer.description")}
          />
          <SettingsCard>
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.memory.summarizer.model.label")}
                description={t("settings.memory.summarizer.model.description")}
                control={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Button
                      variant="text"
                      size="small"
                      onMouseDown={handleTriggerMouseDown}
                      onClick={handleTriggerClick}
                      disabled={loading || modelsLoading}
                      title={selectedModelLabel ?? t("settings.memory.summarizer.model.defaultOption")}
                      aria-label={selectedModelLabel ?? t("settings.memory.summarizer.model.defaultOption")}
                      aria-haspopup="dialog"
                      aria-expanded={isMenuOpen}
                      endIcon={<LuChevronDown size={14} />}
                      sx={{
                        justifyContent: "flex-start",
                        textTransform: "none",
                        color: "text.secondary",
                        px: 0,
                        py: 0,
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{ display: "inline-flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}
                      >
                        {selectedOption ? (
                          <>
                            <ProviderMark providerId={selectedOption.providerId} size={14} />
                            <Box component="span" sx={{ color: "text.secondary", ml: 0.5 }}>
                              {selectedOption.providerName}
                            </Box>
                            <Box component="span" aria-hidden="true" sx={{ mx: 0.75, color: "text.disabled" }}>
                              /
                            </Box>
                            <Box
                              component="span"
                              sx={{ color: "text.primary", overflow: "hidden", textOverflow: "ellipsis" }}
                            >
                              {selectedOption.name}
                            </Box>
                          </>
                        ) : (
                          t("settings.memory.summarizer.model.defaultOption")
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
                      clearSelectionLabel={t("settings.memory.summarizer.model.defaultOption")}
                      onClearSelection={handleClearSelection}
                    />
                  </Box>
                }
              />
              {modelsError ? (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {modelsError}
                </Alert>
              ) : null}
            </SettingsRows>
          </SettingsCard>
        </Box>
      ) : null}

      {saveError ? (
        <Alert severity="error" sx={{ mt: 1 }}>
          {saveError}
        </Alert>
      ) : null}
    </Stack>
  );
}
