import { useGlobalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { readRouteParam } from "@/lib/navigation/read-route-param";
import { loadStoredShellState } from "@/lib/storage/shell-state-storage";

import { type WorkspaceContext, toWorkspaceContext } from "../notification-runtime-helpers";

type GlobalShellParams = {
  changeKind?: string | string[];
  filePath?: string | string[];
  kind?: string | string[];
  orgId?: string | string[];
  previewKind?: string | string[];
  projectId?: string | string[];
  tab?: string | string[];
  terminalId?: string | string[];
  workspaceId?: string | string[];
};

function readStoredTerminalContext(stored: Awaited<ReturnType<typeof loadStoredShellState>>): {
  currentKind: "terminal";
  currentTerminalId: string | null;
  currentWorkspaceContext: WorkspaceContext;
} | null {
  if (!stored) {
    return null;
  }

  for (const terminals of Object.values(stored.terminalsByWorkspaceId)) {
    const firstTerminal = terminals[0];
    if (!firstTerminal) {
      continue;
    }

    const workspaceContext = toWorkspaceContext({
      kind: "terminal",
      orgId: firstTerminal.orgId,
      projectId: firstTerminal.projectId,
      workspaceId: firstTerminal.workspaceId,
    });
    if (workspaceContext) {
      return {
        currentKind: "terminal",
        currentTerminalId: firstTerminal.id,
        currentWorkspaceContext: workspaceContext,
      };
    }
  }

  return null;
}

/** Owns current shell workspace/terminal context resolution from route and persisted shell state. */
export function useNotificationRouteContext() {
  const params = useGlobalSearchParams<GlobalShellParams>();
  const [storedWorkspaceContext, setStoredWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [storedKind, setStoredKind] = useState<string | null>(null);
  const [storedTerminalId, setStoredTerminalId] = useState<string | null>(null);
  const routeKind = readRouteParam(params.kind);
  const routePreviewKind = readRouteParam(params.previewKind);
  const routeFilePath = readRouteParam(params.filePath);

  const currentPaneKind = useMemo(() => {
    if (routePreviewKind === "file" && routeFilePath) {
      return "file";
    }

    if (routePreviewKind === "diff" && routeFilePath) {
      return "diff";
    }

    return routeKind ?? storedKind;
  }, [routeFilePath, routeKind, routePreviewKind, storedKind]);

  const routeWorkspaceContext = useMemo(() => {
    const orgId = readRouteParam(params.orgId);
    const projectId = readRouteParam(params.projectId);
    const workspaceId = readRouteParam(params.workspaceId);
    return toWorkspaceContext({
      kind: routeKind ?? "",
      orgId,
      projectId,
      workspaceId,
    });
  }, [params.orgId, params.projectId, params.workspaceId, routeKind]);

  const currentTerminalId = useMemo(() => {
    if (currentPaneKind !== "terminal") {
      return null;
    }

    return readRouteParam(params.terminalId);
  }, [currentPaneKind, params.terminalId]);

  useEffect(() => {
    if (routeWorkspaceContext) {
      setStoredWorkspaceContext(routeWorkspaceContext);
      setStoredKind(routeKind ?? null);
      setStoredTerminalId(currentPaneKind === "terminal" ? readRouteParam(params.terminalId) : null);
      return;
    }

    let cancelled = false;
    void loadStoredShellState().then((stored) => {
      if (cancelled || !stored) {
        return;
      }

      const storedTerminalContext = readStoredTerminalContext(stored);
      if (!storedTerminalContext) {
        return;
      }

      setStoredKind(storedTerminalContext.currentKind);
      setStoredTerminalId(storedTerminalContext.currentTerminalId);
      setStoredWorkspaceContext(storedTerminalContext.currentWorkspaceContext);
    });

    return () => {
      cancelled = true;
    };
  }, [currentPaneKind, params.terminalId, routeKind, routeWorkspaceContext]);

  return {
    currentKind: currentPaneKind,
    currentTerminalId: currentTerminalId ?? storedTerminalId,
    currentWorkspaceContext: routeWorkspaceContext ?? storedWorkspaceContext,
  };
}
