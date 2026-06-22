import type { Router } from "expo-router";
import { useEffect, useRef } from "react";

import { isClosedTerminalIdSuppressed, unmarkClosedTerminalId } from "../state/shell-closed-terminal-guard";
import { DEFAULT_TERMINAL_MODEL_ID } from "../state/shell.constants";
import type { TerminalMap } from "../state/shell.types";
import type { ShellState } from "../state/useShellState";
import { workspaceSidebarLabel } from "../view-model/shell-labels";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import { isMissingSelectedTerminalTab, readWorkspaceSelection } from "./shell-recovery-helpers";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellTerminalRecovery({
  screenContext,
  shell,
  t,
  terminalsById,
}: {
  screenContext: ShellScreenContext;
  shell: ShellState;
  t: Translate;
  terminalsById: TerminalMap;
}) {
  const recoveredMissingTerminalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shell.isScreenFocused) return;
    if (screenContext.isShellLoading || !shell.hasRestoredStoredState) return;

    const selectedTerminalId = shell.activeTerminalId;
    if (!selectedTerminalId) {
      recoveredMissingTerminalIdRef.current = null;
      return;
    }

    if (terminalsById[selectedTerminalId]) {
      recoveredMissingTerminalIdRef.current = null;
      unmarkClosedTerminalId(selectedTerminalId);
      return;
    }

    if (isClosedTerminalIdSuppressed(selectedTerminalId)) {
      recoveredMissingTerminalIdRef.current = null;
      return;
    }

    const workspaceSelection = readWorkspaceSelection(shell.selection);
    if (!workspaceSelection) {
      return;
    }

    if (!isMissingSelectedTerminalTab(shell.activePaneTab, selectedTerminalId, terminalsById)) {
      recoveredMissingTerminalIdRef.current = null;
      return;
    }

    if (!screenContext.selectedWorkspace || recoveredMissingTerminalIdRef.current === selectedTerminalId) {
      return;
    }

    recoveredMissingTerminalIdRef.current = selectedTerminalId;
    const createdAt = new Date().toISOString();
    shell.ensureTerminal({
      cachedOutput: null,
      createdAt,
      id: selectedTerminalId,
      label: t("shell.newTerminal"),
      lastMessagePreview: null,
      modelId: DEFAULT_TERMINAL_MODEL_ID,
      nodeId: screenContext.selectedWorkspace.nodeId,
      orgId: workspaceSelection.orgId,
      projectId: workspaceSelection.projectId,
      session: null,
      status: "initializing",
      subtitle: workspaceSidebarLabel(screenContext.selectedWorkspace, t),
      updatedAt: createdAt,
      workspaceId: workspaceSelection.workspaceId,
    });
    unmarkClosedTerminalId(selectedTerminalId);
  }, [screenContext.isShellLoading, screenContext.selectedWorkspace, shell, t, terminalsById]);
}
