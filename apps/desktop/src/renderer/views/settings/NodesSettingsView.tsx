import {
  Alert,
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowLeftRight, LuTrash2 } from "react-icons/lu";
import { api } from "../../api/client";
import type { NodeRecord, OrganizationMemberRecord } from "../../api/types";
import { unregisterNode, updateNodeScope } from "../../commands/nodeCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { StatusIndicator } from "../../components/StatusIndicator";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { sessionStore } from "../../store/sessionStore";

function resolveOwnerLabel(node: NodeRecord, members: OrganizationMemberRecord[], fallbackLabel: string): string {
  if (!node.ownerUserId) {
    return fallbackLabel;
  }

  const member = members.find((entry) => entry.userId === node.ownerUserId);
  if (!member) {
    return fallbackLabel;
  }

  return member.name?.trim() || member.email;
}

function resolveNodeVersion(node: NodeRecord, fallbackLabel: string): string {
  const version = node.metadata?.version;
  return typeof version === "string" && version.trim() ? version : fallbackLabel;
}

function resolveNodeTypeLabel(node: NodeRecord, privateLabel: string, sharedLabel: string): string {
  return node.scope === "shared" ? sharedLabel : privateLabel;
}

function resolveNodeKindLabel(node: NodeRecord, managedLabel: string, externalLabel: string): string {
  return node.kind === "external" ? externalLabel : managedLabel;
}

type ScopeChangeTarget = {
  node: NodeRecord;
  newScope: "private" | "shared";
};

export function NodesSettingsView() {
  const { t } = useTranslation();
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const organizations = sessionStore((state) => state.organizations);
  const currentUserId = sessionStore((state) => state.currentUser?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const [scopeChangeTarget, setScopeChangeTarget] = useState<ScopeChangeTarget | null>(null);
  const [isScopeChanging, setIsScopeChanging] = useState(false);
  const [scopeChangeError, setScopeChangeError] = useState<string | null>(null);
  const [unregisterTarget, setUnregisterTarget] = useState<NodeRecord | null>(null);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [unregisterError, setUnregisterError] = useState<string | null>(null);

  const organizationId = selectedOrganizationId ?? organizations[0]?.id;

  const currentUserRole = organizations
    .find((o) => o.id === organizationId)
    ?.members?.find((m) => m.userId === currentUserId)?.role;

  useEffect(() => {
    if (!organizationId) {
      setNodes([]);
      setMembers([]);
      setHasLoadError(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const [nextNodes, nextMembers] = await Promise.all([
          api.node.listByOrg(organizationId),
          api.org.listMembers(organizationId),
        ]);

        if (cancelled) {
          return;
        }

        setNodes(nextNodes);
        setMembers(nextMembers);
      } catch (error) {
        console.error("[NodesSettingsView] Failed to load organization nodes", error);
        if (!cancelled) {
          setNodes([]);
          setMembers([]);
          setHasLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  function canChangeScope(node: NodeRecord): boolean {
    if (node.scope === "private") {
      // Only the owner may promote their private node to shared.
      return node.ownerUserId === currentUserId;
    }
    // Shared nodes: only admins and owners can demote back to private.
    return currentUserRole === "owner" || currentUserRole === "admin";
  }

  function handleScopeChangeRequest(node: NodeRecord) {
    const newScope: "private" | "shared" = node.scope === "private" ? "shared" : "private";
    setScopeChangeError(null);
    setScopeChangeTarget({ node, newScope });
  }

  async function handleScopeChangeConfirm() {
    if (!scopeChangeTarget || !organizationId) {
      return;
    }

    setIsScopeChanging(true);
    setScopeChangeError(null);

    try {
      const updated = await updateNodeScope(scopeChangeTarget.node.id, scopeChangeTarget.newScope);
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setScopeChangeTarget(null);
    } catch (error) {
      setScopeChangeError(getErrorMessage(error));
    } finally {
      setIsScopeChanging(false);
    }
  }

  function handleScopeChangeCancel() {
    if (isScopeChanging) {
      return;
    }
    setScopeChangeTarget(null);
    setScopeChangeError(null);
  }

  function canUnregister(node: NodeRecord): boolean {
    if (node.kind !== "external") {
      return false;
    }
    return node.ownerUserId === currentUserId || currentUserRole === "owner" || currentUserRole === "admin";
  }

  function handleUnregisterRequest(node: NodeRecord) {
    setUnregisterError(null);
    setUnregisterTarget(node);
  }

  function handleUnregisterCancel() {
    if (isUnregistering) {
      return;
    }
    setUnregisterTarget(null);
    setUnregisterError(null);
  }

  async function handleUnregisterConfirm() {
    if (!unregisterTarget) {
      return;
    }

    setIsUnregistering(true);
    setUnregisterError(null);

    try {
      await unregisterNode(unregisterTarget.id);
      setNodes((prev) => prev.filter((node) => node.id !== unregisterTarget.id));
      setUnregisterTarget(null);
    } catch (error) {
      setUnregisterError(getErrorMessage(error));
    } finally {
      setIsUnregistering(false);
    }
  }

  const confirmDialogDescription = scopeChangeTarget
    ? scopeChangeTarget.newScope === "shared"
      ? t("settings.nodes.scopeChangeDialog.toSharedDescription", { name: scopeChangeTarget.node.name })
      : t("settings.nodes.scopeChangeDialog.toPrivateDescription", { name: scopeChangeTarget.node.name })
    : "";

  return (
    <Box>
      <SettingsSectionHeader title={t("settings.nodes.title")} description={t("settings.nodes.description")} />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.nodes.loadError")}</Alert> : null}
            {scopeChangeError ? (
              <Alert severity="error" sx={{ mt: hasLoadError ? 1 : 0, mb: 1.5 }}>
                {scopeChangeError}
              </Alert>
            ) : null}
            {unregisterError ? (
              <Alert severity="error" sx={{ mt: hasLoadError || scopeChangeError ? 1 : 0, mb: 1.5 }}>
                {unregisterError}
              </Alert>
            ) : null}
            <Table
              size="small"
              sx={{
                mt: hasLoadError || scopeChangeError || unregisterError ? 1.5 : 0,
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
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.nodes.columns.name")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.type")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.kind")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.version")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.owner")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.status")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {nodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t("settings.nodes.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  nodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell>{node.name}</TableCell>
                      <TableCell>
                        {resolveNodeTypeLabel(
                          node,
                          t("settings.nodes.types.private"),
                          t("settings.nodes.types.shared"),
                        )}
                      </TableCell>
                      <TableCell>
                        {resolveNodeKindLabel(
                          node,
                          t("settings.nodes.kinds.managed"),
                          t("settings.nodes.kinds.external"),
                        )}
                      </TableCell>
                      <TableCell>{resolveNodeVersion(node, t("settings.nodes.values.unknownVersion"))}</TableCell>
                      <TableCell>{resolveOwnerLabel(node, members, t("settings.nodes.values.unknownOwner"))}</TableCell>
                      <TableCell>
                        <StatusIndicator
                          label={node.isOnline ? t("settings.nodes.status.online") : t("settings.nodes.status.offline")}
                          color={node.isOnline ? "success" : "disabled"}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 0.5 }}>
                        {canChangeScope(node) ? (
                          <Tooltip
                            title={
                              node.scope === "private"
                                ? t("settings.nodes.actions.makeShared")
                                : t("settings.nodes.actions.makePrivate")
                            }
                          >
                            <IconButton
                              size="small"
                              onClick={() => handleScopeChangeRequest(node)}
                              aria-label={
                                node.scope === "private"
                                  ? t("settings.nodes.actions.makeShared")
                                  : t("settings.nodes.actions.makePrivate")
                              }
                            >
                              <LuArrowLeftRight size={14} />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {canUnregister(node) ? (
                          <Tooltip title={t("settings.nodes.actions.unregister")}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleUnregisterRequest(node)}
                              aria-label={t("settings.nodes.actions.unregister")}
                            >
                              <LuTrash2 size={14} />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>

      <ConfirmationDialog
        open={scopeChangeTarget !== null}
        title={t("settings.nodes.scopeChangeDialog.title")}
        description={confirmDialogDescription}
        confirmLabel={t("settings.nodes.scopeChangeDialog.confirm")}
        confirmColor="warning"
        isSubmitting={isScopeChanging}
        onCancel={handleScopeChangeCancel}
        onConfirm={() => void handleScopeChangeConfirm()}
      />
      <ConfirmationDialog
        open={unregisterTarget !== null}
        title={t("settings.nodes.unregisterDialog.title")}
        description={t("settings.nodes.unregisterDialog.description", { name: unregisterTarget?.name ?? "" })}
        confirmLabel={t("settings.nodes.unregisterDialog.confirm")}
        confirmColor="error"
        isSubmitting={isUnregistering}
        onCancel={handleUnregisterCancel}
        onConfirm={() => void handleUnregisterConfirm()}
      />
    </Box>
  );
}
