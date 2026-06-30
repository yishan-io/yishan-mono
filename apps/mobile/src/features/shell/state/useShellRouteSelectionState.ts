import type { ShellSelection } from "@/features/shell/state/shell.types";
import { logMobileDebug } from "@/lib/debug/mobileDebug";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShellParams } from "./shell-route-state";
import { readRoutePreview, toSelection } from "./shell-route-state";
import { selectionsEqual } from "./shell-state-helpers";

export function selectionSharesRouteScope(left: ShellSelection, right: ShellSelection) {
  if (left.kind === "home" || right.kind === "home") {
    return left.kind === right.kind;
  }

  return left.orgId === right.orgId && left.projectId === right.projectId && left.workspaceId === right.workspaceId;
}

export function resolveShellSelectionFromRoute(input: {
  currentSelection: ShellSelection;
  pendingSelection: ShellSelection | null;
  routeSelection: ShellSelection;
}) {
  if (input.pendingSelection && selectionsEqual(input.pendingSelection, input.routeSelection)) {
    return {
      nextPendingSelection: null,
      nextSelection: input.currentSelection,
    };
  }

  if (!input.pendingSelection && !selectionsEqual(input.currentSelection, input.routeSelection)) {
    return {
      nextPendingSelection: null,
      nextSelection: input.routeSelection,
    };
  }

  return {
    nextPendingSelection: input.pendingSelection,
    nextSelection: input.currentSelection,
  };
}

export function useShellRouteSelectionState(params: ShellParams) {
  const routeSelection = useMemo(
    () =>
      toSelection({
        kind: params.kind,
        orgId: params.orgId,
        projectId: params.projectId,
        terminalId: params.terminalId,
        workspaceId: params.workspaceId,
      }),
    [params.kind, params.orgId, params.projectId, params.workspaceId, params.terminalId],
  );
  const [selection, setSelectionState] = useState<ShellSelection>(routeSelection);
  const [pendingSelection, setPendingSelection] = useState<ShellSelection | null>(null);
  const stageSelection = useCallback((nextSelection: ShellSelection | null) => {
    if (nextSelection === null) {
      setPendingSelection(null);
      return;
    }

    setSelectionState(nextSelection);
    setPendingSelection(nextSelection);
  }, []);
  const rawRoutePreview = useMemo(
    () =>
      readRoutePreview({
        changeKind: params.changeKind,
        filePath: params.filePath,
        kind: params.kind,
        orgId: params.orgId,
        previewKind: params.previewKind,
        projectId: params.projectId,
        terminalId: params.terminalId,
        tab: params.tab,
        workspaceId: params.workspaceId,
      }),
    [
      params.changeKind,
      params.filePath,
      params.kind,
      params.orgId,
      params.previewKind,
      params.projectId,
      params.terminalId,
      params.tab,
      params.workspaceId,
    ],
  );
  const routePreview = useMemo(() => {
    if (!selectionSharesRouteScope(selection, routeSelection)) {
      return null;
    }

    return rawRoutePreview;
  }, [rawRoutePreview, routeSelection, selection]);

  useEffect(() => {
    const transition = resolveShellSelectionFromRoute({
      currentSelection: selection,
      pendingSelection,
      routeSelection,
    });
    if (transition.nextSelection !== selection) {
      setSelectionState(transition.nextSelection);
    }
    if (transition.nextPendingSelection !== pendingSelection) {
      setPendingSelection(transition.nextPendingSelection);
    }
  }, [pendingSelection, routeSelection, selection]);

  useEffect(() => {
    if (selectionSharesRouteScope(selection, routeSelection)) {
      return;
    }

    logMobileDebug("shell.route", "ignoring stale route preview during workspace switch", {
      paramsFilePath: params.filePath ?? null,
      paramsPreviewKind: params.previewKind ?? null,
      pendingSelection: selection,
      routeSelection,
      rawRoutePreview,
      targetRouteSelection: routeSelection,
    });
  }, [params.filePath, params.previewKind, rawRoutePreview, routeSelection, selection]);

  return {
    routePreview,
    selectedOrganizationId: selection.kind === "home" ? (params.orgId ?? null) : selection.orgId,
    selection,
    setPendingSelection: stageSelection,
  };
}
