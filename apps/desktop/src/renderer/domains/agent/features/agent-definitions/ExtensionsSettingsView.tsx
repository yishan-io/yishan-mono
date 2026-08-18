import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck, LuUser } from "react-icons/lu";
import {
  installExtension,
  listExtensions,
  removeExtension,
  updateExtension,
} from "../../commands/agentDefinitionCommands";
import { getErrorMessage } from "../../../../helpers/errorHelpers";
import type { PiExtensionInfo } from "../../../../rpc/daemonTypes";
import { CenteredSpinner } from "../../../../ui/components/CenteredSpinner";
import {SettingsCard} from "../../../../ui/components/SettingsPrimitives";

const LOCAL_FILE_SOURCE = "local file";

const EXTENSION_TABLE_SX = {
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

type AddExtensionDialogProps = {
  onClose: () => void;
  onInstalled: () => void;
};

function AddExtensionDialog({ onClose, onInstalled }: AddExtensionDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    const trimmed = source.trim();
    if (!trimmed) {
      setError(t("settings.customize.extensions.errors.sourceRequired"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await installExtension(trimmed);
      onInstalled();
      onClose();
    } catch (installError) {
      setError(getErrorMessage(installError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("settings.customize.extensions.dialogs.add.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
          {t("settings.customize.extensions.dialogs.add.description")}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
          }}
          placeholder={t("settings.customize.extensions.dialogs.add.placeholder")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleInstall();
            }
          }}
        />
        {error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={isSubmitting}>
          {t("common.actions.cancel")}
        </Button>
        <Button disabled={isSubmitting} onClick={() => void handleInstall()}>
          {t("settings.customize.extensions.dialogs.add.install")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Lists installed pi extensions with official-vs-user classification and
 * supports install/update/remove through the daemon (pi CLI under the hood).
 */
export function ExtensionsSettingsView() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<PiExtensionInfo[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [operatingSource, setOperatingSource] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<PiExtensionInfo | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const loadExtensions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listExtensions();
      if (!isMountedRef.current) return;
      setExtensions(result);
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
    void loadExtensions();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadExtensions]);

  const runOperation = useCallback(
    async (source: string, operation: () => Promise<void>, successKey: string) => {
      setOperatingSource(source);
      try {
        await operation();
        setSnackbar(t(successKey));
      } catch (error) {
        setSnackbar(getErrorMessage(error));
      } finally {
        setOperatingSource(null);
      }
      void loadExtensions();
    },
    [loadExtensions, t],
  );

  return (
    <Box data-testid="extensions-settings-panel">
      <SettingsCard>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
          <Button
            onClick={() => {
              setIsAddDialogOpen(true);
            }}
            data-testid="add-extension-button"
          >
            {t("settings.customize.extensions.actions.add")}
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
            <Table size="small" sx={EXTENSION_TABLE_SX}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.customize.extensions.columns.name")}</TableCell>
                  <TableCell>{t("settings.customize.extensions.columns.version")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {extensions.length === 0 && !loadError ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" sx={{ color: "text.secondary", py: 1 }}>
                        {t("settings.customize.extensions.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  extensions.map((extension) => {
                    const isLocalFile = extension.source === LOCAL_FILE_SOURCE;
                    const isOperating = operatingSource === extension.source;
                    return (
                      <TableRow key={extension.source} data-testid={`extension-row-${extension.name}`}>
                        <TableCell>
                          <Box>
                            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                              <Box component="span" sx={{ fontWeight: 600, wordBreak: "break-all" }}>
                                {extension.name}
                              </Box>
                              {extension.official ? (
                                <Tooltip title={t("settings.customize.extensions.official")}>
                                  <Box component="span" sx={{ display: "inline-flex", color: "primary.main" }}>
                                    <LuBadgeCheck size={16} />
                                  </Box>
                                </Tooltip>
                              ) : (
                                <Tooltip title={t("settings.customize.extensions.userInstalled")}>
                                  <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                                    <LuUser size={16} />
                                  </Box>
                                </Tooltip>
                              )}
                            </Box>
                            {extension.description ? (
                              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                {extension.description}
                              </Typography>
                            ) : null}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {extension.version ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <Typography variant="body2">{`v${extension.version}`}</Typography>
                              {extension.hasUpdate && extension.latestVersion ? (
                                <>
                                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    →
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: "primary.main" }}>
                                    {`v${extension.latestVersion}`}
                                  </Typography>
                                </>
                              ) : null}
                            </Box>
                          ) : null}
                        </TableCell>
                        <TableCell align="right">
                          {!isLocalFile ? (
                            <Box sx={{ display: "inline-flex", gap: 0.5 }}>
                              {extension.hasUpdate ? (
                                <Button
                                  size="small"
                                  disabled={isOperating}
                                  onClick={() =>
                                    void runOperation(
                                      extension.source,
                                      () => updateExtension(extension.source),
                                      "settings.customize.extensions.messages.updated",
                                    )
                                  }
                                >
                                  {t("settings.customize.extensions.actions.update")}
                                </Button>
                              ) : null}
                              {!extension.official ? (
                                <Button
                                  size="small"
                                  color="error"
                                  disabled={isOperating || !extension.installed}
                                  onClick={() => {
                                    setRemoveCandidate(extension);
                                  }}
                                >
                                  {t("settings.customize.extensions.actions.remove")}
                                </Button>
                              ) : null}
                            </Box>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>

      {isAddDialogOpen ? (
        <AddExtensionDialog
          onClose={() => {
            setIsAddDialogOpen(false);
          }}
          onInstalled={() => {
            setSnackbar(t("settings.customize.extensions.messages.installed"));
            void loadExtensions();
          }}
        />
      ) : null}

      {removeCandidate ? (
        <Dialog
          open
          onClose={() => {
            setRemoveCandidate(null);
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>{t("settings.customize.extensions.dialogs.remove.title")}</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2">
              {t("settings.customize.extensions.dialogs.remove.description", { name: removeCandidate.name })}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              color="inherit"
              onClick={() => {
                setRemoveCandidate(null);
              }}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={() => {
                const candidate = removeCandidate;
                setRemoveCandidate(null);
                void runOperation(
                  candidate.source,
                  () => removeExtension(candidate.source),
                  "settings.customize.extensions.messages.removed",
                );
              }}
            >
              {t("settings.customize.extensions.dialogs.remove.confirm")}
            </Button>
          </DialogActions>
        </Dialog>
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
