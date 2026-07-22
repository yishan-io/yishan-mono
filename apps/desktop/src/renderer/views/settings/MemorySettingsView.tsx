import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Stack,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";
import { AgentIcon } from "../../components/AgentIcon";
import { ModelAutocomplete, type ModelOption } from "../../components/ModelAutocomplete";
import {
  SettingsCard,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
  SettingsToggleRow,
} from "../../components/settings";
import { AGENT_SETTINGS_LABEL_KEY_BY_KIND, SUPPORTED_DESKTOP_AGENT_KINDS } from "../../helpers/agentSettings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type { MemoryConfig } from "../../rpc/daemonTypes";
import { getDaemonClient } from "../../rpc/rpcTransport";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";

export function MemorySettingsView() {
  const { t } = useTranslation();
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const enabledAgentKinds = SUPPORTED_DESKTOP_AGENT_KINDS.filter((kind) => inUseByAgentKind[kind]);
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const modelsRequestIdRef = useRef(0);

  const fetchModels = useCallback(async (agentKind: string) => {
    const requestId = modelsRequestIdRef.current + 1;
    modelsRequestIdRef.current = requestId;

    if (!agentKind) {
      setModels([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const client = await getDaemonClient();
      const result = await client.agent.listModels({ agentKind });
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
      const client = await getDaemonClient();
      const cfg = await client.memory.getConfig();
      setConfig(cfg);
      setSaveError(null);
      if (cfg.agentKind) {
        fetchModels(cfg.agentKind);
      }
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
    setConfig(next);
    try {
      const client = await getDaemonClient();
      await client.memory.updateConfig(next);
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

  const handleAgentKindChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      if (!config) return;
      const agentKind = event.target.value;
      const next = { ...config, agentKind, model: "" };
      persistConfig(next);
      fetchModels(agentKind);
    },
    [config, persistConfig, fetchModels],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      if (!config) return;
      persistConfig({ ...config, model });
    },
    [config, persistConfig],
  );

  const handleRefreshModels = useCallback(async () => {
    const agentKind = config?.agentKind;
    if (!agentKind) return;
    setIsRefreshingModels(true);
    setModelsError(null);
    try {
      const client = await getDaemonClient();
      const result = await client.agent.listModels({ agentKind, forceRefresh: true });
      setModels(result.models ?? []);
    } catch (error) {
      setModelsError(getErrorMessage(error));
      setModels([]);
    } finally {
      setIsRefreshingModels(false);
    }
  }, [config?.agentKind]);

  const modelValue = config?.model ?? "";

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
                title={t("settings.memory.summarizer.agentKind.label")}
                description={t("settings.memory.summarizer.agentKind.description")}
                control={
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <Select value={config.agentKind} disabled={loading} onChange={handleAgentKindChange}>
                      {enabledAgentKinds.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                          <AgentIcon agentKind={kind} context="settingsRow" decorative />
                          <Box component="span" sx={{ ml: 1 }}>
                            {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[kind])}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                }
              />
              <SettingsControlRow
                title={t("settings.memory.summarizer.model.label")}
                description={t("settings.memory.summarizer.model.description")}
                control={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <ModelAutocomplete
                      options={models}
                      value={modelValue}
                      onChange={handleModelChange}
                      loading={modelsLoading}
                      disabled={loading || !config.agentKind}
                      placeholder={t("settings.memory.summarizer.model.placeholder")}
                      noOptionsText={modelsError ?? undefined}
                      sx={{ minWidth: 280 }}
                    />
                    <IconButton
                      onClick={handleRefreshModels}
                      disabled={loading || isRefreshingModels || !config.agentKind}
                      aria-label={t("settings.memory.summarizer.model.refresh")}
                    >
                      {isRefreshingModels || modelsLoading ? <CircularProgress size={16} /> : <LuRefreshCw size={16} />}
                    </IconButton>
                  </Box>
                }
              />
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
