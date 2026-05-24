import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiCopy, BiTrash } from "react-icons/bi";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { StatusIndicator } from "../../components/StatusIndicator";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { api } from "../../api/client";
import type { ServiceTokenRecord } from "../../api/serviceTokenTypes";

function formatTokenDate(dateString: string | null): string {
  if (!dateString) {
    return "—";
  }
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolveTokenStatus(
  token: ServiceTokenRecord,
  labels: { active: string; revoked: string; expired: string },
): { label: string; color: "success" | "error" | "disabled" } {
  if (token.revokedAt) {
    return { label: labels.revoked, color: "error" };
  }
  if (token.expiresAt && new Date(token.expiresAt) <= new Date()) {
    return { label: labels.expired, color: "disabled" };
  }
  return { label: labels.active, color: "success" };
}

export function ServiceTokenSettingsView() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [tokens, setTokens] = useState<ServiceTokenRecord[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ServiceTokenRecord | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const result = await api.serviceToken.list();
      setTokens(result);
    } catch (error) {
      console.error("[ServiceTokenSettingsView] Failed to load service tokens", error);
      setHasLoadError(true);
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  const handleRevoke = async (tokenId: string) => {
    try {
      await api.serviceToken.revoke(tokenId);
      setRevokeTarget(null);
      await loadTokens();
    } catch (error) {
      console.error("[ServiceTokenSettingsView] Failed to revoke service token", error);
    }
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeTokens = tokens.filter((token) => !token.revokedAt);
  const revokedTokens = tokens.filter((token) => token.revokedAt);

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.serviceTokens.title")}
        description={t("settings.serviceTokens.description")}
        action={
          <Button variant="text" size="small" onClick={() => setIsCreateOpen(true)}>
            {t("settings.serviceTokens.create")}
          </Button>
        }
      />

      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.serviceTokens.loadError")}</Alert> : null}
            <Table
              size="small"
              sx={{
                mt: hasLoadError ? 1.5 : 0,
                "& th": { fontWeight: 600, borderBottomColor: "divider" },
                "& th, & td": { borderBottomColor: "divider" },
                "& tbody tr:last-of-type td": { borderBottom: "none" },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.serviceTokens.columns.name")}</TableCell>
                  <TableCell>{t("settings.serviceTokens.columns.token")}</TableCell>
                  <TableCell>{t("settings.serviceTokens.columns.lastUsed")}</TableCell>
                  <TableCell>{t("settings.serviceTokens.columns.expires")}</TableCell>
                  <TableCell>{t("settings.serviceTokens.columns.status")}</TableCell>
                  <TableCell sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {activeTokens.length === 0 && revokedTokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t("settings.serviceTokens.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  [...activeTokens, ...revokedTokens].map((token) => {
                    const status = resolveTokenStatus(token, {
                      active: t("settings.serviceTokens.status.active"),
                      revoked: t("settings.serviceTokens.status.revoked"),
                      expired: t("settings.serviceTokens.status.expired"),
                    });
                    return (
                      <TableRow key={token.id} sx={{ opacity: token.revokedAt ? 0.5 : 1 }}>
                        <TableCell>{token.name}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                            {token.tokenPrefix}…
                          </Typography>
                        </TableCell>
                        <TableCell>{formatTokenDate(token.lastUsedAt)}</TableCell>
                        <TableCell>{formatTokenDate(token.expiresAt)}</TableCell>
                        <TableCell>
                          <StatusIndicator label={status.label} color={status.color} />
                        </TableCell>
                        <TableCell>
                          {!token.revokedAt ? (
                            <Tooltip title={t("settings.serviceTokens.actions.revoke")}>
                              <IconButton size="small" onClick={() => setRevokeTarget(token)}>
                                <BiTrash size={16} />
                              </IconButton>
                            </Tooltip>
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

      {/* Created token display */}
      {createdToken ? (
        <Alert
          severity="success"
          sx={{ mt: 2 }}
          action={
            <Tooltip title={copied ? t("settings.serviceTokens.copied") : t("settings.serviceTokens.actions.copy")}>
              <IconButton size="small" onClick={() => handleCopyToken(createdToken)}>
                <BiCopy size={16} />
              </IconButton>
            </Tooltip>
          }
          onClose={() => setCreatedToken(null)}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {t("settings.serviceTokens.createdWarning")}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}
          >
            {createdToken}
          </Typography>
        </Alert>
      ) : null}

      <CreateServiceTokenDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(token) => {
          setCreatedToken(token);
          setIsCreateOpen(false);
          void loadTokens();
        }}
      />

      <Dialog open={revokeTarget !== null} onClose={() => setRevokeTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("settings.serviceTokens.revokeDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("settings.serviceTokens.revokeDialog.description", { name: revokeTarget?.name ?? "" })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeTarget(null)}>
            {t("settings.serviceTokens.revokeDialog.cancel")}
          </Button>
          <Button color="error" variant="contained" onClick={() => revokeTarget && handleRevoke(revokeTarget.id)}>
            {t("settings.serviceTokens.revokeDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function CreateServiceTokenDialog(props: {
  open: boolean;
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const input: { name: string; expiresInDays?: number } = { name: name.trim() };
      const parsedDays = Number.parseInt(expiresInDays, 10);
      if (parsedDays > 0) {
        input.expiresInDays = parsedDays;
      }

      const result = await api.serviceToken.create(input);
      if (result.token) {
        props.onCreated(result.token);
      }
      setName("");
      setExpiresInDays("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName("");
    setExpiresInDays("");
    setError(null);
    props.onClose();
  };

  return (
    <Dialog open={props.open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("settings.serviceTokens.createDialog.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("settings.serviceTokens.createDialog.description")}
          </Typography>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t("settings.serviceTokens.createDialog.nameLabel")}
            </Typography>
            <TextField
              autoFocus
              placeholder={t("settings.serviceTokens.createDialog.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              fullWidth
            />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t("settings.serviceTokens.createDialog.expiresLabel")}
            </Typography>
            <TextField
              placeholder={t("settings.serviceTokens.createDialog.expiresPlaceholder")}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              type="number"
              size="small"
              fullWidth
              helperText={t("settings.serviceTokens.createDialog.expiresHelp")}
            />
          </Box>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("settings.serviceTokens.createDialog.cancel")}</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim() || isCreating}>
          {isCreating
            ? t("settings.serviceTokens.createDialog.creating")
            : t("settings.serviceTokens.createDialog.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
