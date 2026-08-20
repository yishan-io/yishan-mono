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
import { NodesTable } from "./NodesTable";

import type { OrganizationMemberRecord } from "@renderer/domains/organization";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { listOrganizationMembers } from "../../../../domains/organization";
import {
  resolveNodeKindLabel,
  resolveNodeTypeLabel,
  resolveNodeVersion,
  resolveOwnerLabel,
} from "./nodeLabelResolvers";

import { sessionStore } from "@renderer/domains/session";
import { useDialogRegistration } from "@renderer/domains/workbench";
import { ConfirmationDialog } from "@renderer/ui/components/ConfirmationDialog";
import { CenteredSpinner } from "../../../../ui/components/CenteredSpinner";
import { SettingsCard, SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import { StatusIndicator } from "../../../../ui/components/StatusIndicator";
import type { NodeRecord } from "../../api/nodeApi";
import { listOrgNodes, unregisterNode, updateNodeScope } from "../../commands/nodeCommands";

type ScopeChangeTarget = {
  node: NodeRecord;
  newScope: "private" | "shared";
};

export function NodesSettingsView() {
  const { t } = useTranslation();
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const organizations = sessionStore((state) => state.organizations);
  const currentUserId = sessionStore((state) => state.currentUser)?.id;
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

  useDialogRegistration(scopeChangeTarget !== null || unregisterTarget !== null);

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
          listOrgNodes(organizationId),
          listOrganizationMembers(organizationId),
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
            <NodesTable
              nodes={nodes}
              members={members}
              canChangeScope={canChangeScope}
              canUnregister={canUnregister}
              onScopeChangeRequest={handleScopeChangeRequest}
              onUnregisterRequest={handleUnregisterRequest}
            />
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
