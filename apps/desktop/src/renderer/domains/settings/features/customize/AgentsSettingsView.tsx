import {
  Alert,
  Box,
  Button,
  Chip,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck, LuUser } from "react-icons/lu";
import {
  listAgentDefinitions,
  removeAgentDefinition,
  restoreAgentDefinition,
} from "../../../../domains/settings/commands/customizeCommands";
import { getErrorMessage } from "../../../../helpers/errorHelpers";
import type { AgentDefinitionInfo } from "../../../../rpc/daemonTypes";
import { CenteredSpinner } from "../../../../ui/components/CenteredSpinner";
import { SettingsCard } from "../../ui/controls";
import { AgentDetailDialog, ConfirmDialog, CreateAgentDialog } from "./AgentDefinitionDialogs";

const AGENT_TABLE_SX = {
  "& th": {
    fontWeight: 600,
    borderBottomColor: "divider",
  },
  "& th, & td": {
    borderBottomColor: "divider",
  },
  "& tbody tr:last-of-type td": {
    borderBottom: "none",
  },
  "& .MuiTableCell-body": {
    py: 1.25,
  },
};

/**
 * Lists agent definitions (official vs user) and supports create, edit /
 * overwrite, remove, and restore-to-official through the daemon.
 */
export function AgentsSettingsView() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentDefinitionInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinitionInfo | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<AgentDefinitionInfo | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<AgentDefinitionInfo | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listAgentDefinitions();
      if (!isMountedRef.current) return;
      setAgents(result);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError(getErrorMessage(error));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadAgents();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadAgents]);

  const runMutation = useCallback(
    async (operation: () => Promise<void>, messageKey: string) => {
      try {
        await operation();
        setSnackbar(t(messageKey));
      } catch (error) {
        setSnackbar(getErrorMessage(error));
      }
      void loadAgents();
    },
    [loadAgents, t],
  );

  return (
    <Box data-testid="agents-settings-panel">
      <SettingsCard>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
          <Button
            onClick={() => {
              setIsCreateOpen(true);
            }}
            data-testid="create-agent-button"
          >
            {t("settings.customize.agents.actions.create")}
          </Button>
        </Box>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {loadError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {loadError}
              </Alert>
            ) : null}
            <Table size="small" sx={AGENT_TABLE_SX}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.customize.agents.columns.name")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {agents.length === 0 && !loadError ? (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="body2" sx={{ color: "text.secondary", py: 1 }}>
                        {t("settings.customize.agents.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  agents.map((agent) => (
                    <TableRow key={agent.name} data-testid={`agent-row-${agent.name}`}>
                      <TableCell>
                        <Box>
                          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                            <Box component="span" sx={{ fontWeight: 600 }}>
                              {agent.name}
                            </Box>
                            {agent.official ? (
                              <Tooltip title={t("settings.customize.agents.official")}>
                                <Box component="span" sx={{ display: "inline-flex", color: "primary.main" }}>
                                  <LuBadgeCheck size={16} />
                                </Box>
                              </Tooltip>
                            ) : (
                              <Tooltip title={t("settings.customize.agents.userInstalled")}>
                                <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                                  <LuUser size={16} />
                                </Box>
                              </Tooltip>
                            )}
                            {agent.official ? (
                              <Chip
                                size="small"
                                label={t("settings.customize.agents.managed")}
                                variant="outlined"
                                sx={{ fontSize: "0.7rem", height: 22 }}
                              />
                            ) : null}
                          </Box>
                          {agent.description ? (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                              {agent.description}
                            </Typography>
                          ) : null}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: "inline-flex", gap: 0.5 }}>
                          <Button
                            size="small"
                            onClick={() => {
                              setSelectedAgent(agent);
                            }}
                          >
                            {t("settings.customize.agents.actions.edit")}
                          </Button>
                          {agent.official ? (
                            <Button
                              size="small"
                              onClick={() => {
                                setRestoreCandidate(agent);
                              }}
                            >
                              {t("settings.customize.agents.actions.restore")}
                            </Button>
                          ) : (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => {
                                setRemoveCandidate(agent);
                              }}
                            >
                              {t("settings.customize.agents.actions.remove")}
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>

      {selectedAgent ? (
        <AgentDetailDialog
          agent={selectedAgent}
          onClose={() => {
            setSelectedAgent(null);
          }}
          onChanged={(messageKey) => {
            setSnackbar(t(messageKey));
            void loadAgents();
          }}
        />
      ) : null}

      {isCreateOpen ? (
        <CreateAgentDialog
          onClose={() => {
            setIsCreateOpen(false);
          }}
          onCreated={() => {
            setSnackbar(t("settings.customize.agents.messages.created"));
            void loadAgents();
          }}
        />
      ) : null}

      {removeCandidate ? (
        <ConfirmDialog
          titleKey="settings.customize.agents.dialogs.remove.title"
          descriptionKey="settings.customize.agents.dialogs.remove.description"
          confirmKey="settings.customize.agents.dialogs.remove.confirm"
          name={removeCandidate.name}
          onClose={() => {
            setRemoveCandidate(null);
          }}
          onConfirm={() => {
            const candidate = removeCandidate;
            setRemoveCandidate(null);
            void runMutation(() => removeAgentDefinition(candidate.name), "settings.customize.agents.messages.removed");
          }}
        />
      ) : null}

      {restoreCandidate ? (
        <ConfirmDialog
          titleKey="settings.customize.agents.dialogs.restore.title"
          descriptionKey="settings.customize.agents.dialogs.restore.description"
          confirmKey="settings.customize.agents.dialogs.restore.confirm"
          confirmColor="warning"
          name={restoreCandidate.name}
          onClose={() => {
            setRestoreCandidate(null);
          }}
          onConfirm={() => {
            const candidate = restoreCandidate;
            setRestoreCandidate(null);
            void runMutation(
              () => restoreAgentDefinition(candidate.name),
              "settings.customize.agents.messages.restored",
            );
          }}
        />
      ) : null}

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={4000}
        onClose={() => {
          setSnackbar(null);
        }}
        message={snackbar ?? ""}
      />
    </Box>
  );
}
