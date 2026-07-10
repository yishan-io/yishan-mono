import type {
  PaneBranch,
  PaneLeaf,
  ShellWorkspaceTab,
  ShellWorkspaceTabState,
  SplitPaneNode,
  TerminalItem,
  WorkspacePaneLayoutState,
} from "@/features/shell/state/shell.types";
import { trimTerminalOutputForCache } from "@/features/shell/state/terminal-output";

import {
  MAX_PERSISTED_OUTPUT_LENGTH,
  type StoredShellState,
  type StoredTerminalRuntimeItem,
  type StoredTerminalRuntimeState,
  dedupeGhostTerminals,
  isStoredTerminalSession,
  normalizeStoredTerminalSession,
} from "./shell-state-storage-domain";

const DETACHED_WORKSPACE_ID = "__detached__";
const IMPORTED_TERMINAL_ID_PREFIX = "terminal-session-";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isStoredShellWorkspaceTab(value: unknown): value is ShellWorkspaceTab {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.pinned !== "boolean" ||
    !isRecord(value.data)
  ) {
    return false;
  }

  switch (value.kind) {
    case "terminal":
      return typeof value.data.terminalId === "string" && typeof value.data.title === "string";
    case "file":
      return typeof value.data.path === "string" && typeof value.data.isTemporary === "boolean";
    case "diff":
      return (
        typeof value.data.path === "string" &&
        typeof value.data.isTemporary === "boolean" &&
        typeof value.data.changeKind === "string"
      );
    default:
      return false;
  }
}

function isStoredShellWorkspaceTabState(value: unknown): value is ShellWorkspaceTabState {
  return (
    isRecord(value) &&
    typeof value.workspaceId === "string" &&
    typeof value.selectedTabId === "string" &&
    Array.isArray(value.tabs) &&
    value.tabs.every(isStoredShellWorkspaceTab)
  );
}

function isStoredPaneLeaf(value: unknown): value is PaneLeaf {
  return (
    isRecord(value) &&
    value.kind === "leaf" &&
    typeof value.id === "string" &&
    typeof value.selectedTabId === "string" &&
    Array.isArray(value.tabIds) &&
    value.tabIds.every((tabId) => typeof tabId === "string")
  );
}

function isStoredPaneBranch(value: unknown): value is PaneBranch {
  return (
    isRecord(value) &&
    value.kind === "branch" &&
    typeof value.id === "string" &&
    (value.direction === "horizontal" || value.direction === "vertical") &&
    typeof value.ratio === "number" &&
    isStoredSplitPaneNode(value.first) &&
    isStoredSplitPaneNode(value.second)
  );
}

function isStoredSplitPaneNode(value: unknown): value is SplitPaneNode {
  return isStoredPaneLeaf(value) || isStoredPaneBranch(value);
}

function isStoredWorkspacePaneLayoutState(value: unknown): value is WorkspacePaneLayoutState {
  return isRecord(value) && typeof value.activePaneId === "string" && isStoredSplitPaneNode(value.root);
}

function isStoredTerminalItem(value: unknown): value is TerminalItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.orgId === "string" &&
    (item.cachedOutput === undefined || item.cachedOutput === null || typeof item.cachedOutput === "string") &&
    (item.session === undefined || item.session === null || isStoredTerminalSession(item.session))
  );
}

function normalizeStoredTerminalItem(workspaceId: string, terminal: TerminalItem): TerminalItem {
  const { backendSessionId: _backendSessionId, ...rest } = terminal as TerminalItem & {
    backendSessionId?: unknown;
  };

  return {
    ...rest,
    cachedOutput:
      typeof rest.cachedOutput === "string"
        ? trimTerminalOutputForCache(rest.cachedOutput, MAX_PERSISTED_OUTPUT_LENGTH)
        : rest.cachedOutput,
    importedFromBackend:
      rest.importedFromBackend === true || rest.id.startsWith(IMPORTED_TERMINAL_ID_PREFIX) ? true : undefined,
    session: normalizeStoredTerminalSession((rest as TerminalItem & { session?: unknown }).session, workspaceId),
  };
}

function normalizeStoredRuntimeItem(workspaceId: string, item: StoredTerminalRuntimeItem): StoredTerminalRuntimeItem {
  const { backendSessionId: _backendSessionId, ...rest } = item as StoredTerminalRuntimeItem & {
    backendSessionId?: unknown;
  };

  return {
    ...rest,
    cachedOutput:
      typeof rest.cachedOutput === "string"
        ? trimTerminalOutputForCache(rest.cachedOutput, MAX_PERSISTED_OUTPUT_LENGTH)
        : rest.cachedOutput,
    session: normalizeStoredTerminalSession(
      (rest as StoredTerminalRuntimeItem & { session?: unknown }).session,
      workspaceId,
    ),
  };
}

export function parseStoredShellState(raw: string): StoredShellState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShellState>;
    if (!parsed.terminalsByWorkspaceId || typeof parsed.terminalsByWorkspaceId !== "object") {
      return null;
    }

    const rawTerminals = parsed.terminalsByWorkspaceId as Record<string, unknown[]>;
    const terminalsByWorkspaceId = Object.fromEntries(
      Object.entries(rawTerminals)
        .filter(([workspaceId]) => workspaceId !== DETACHED_WORKSPACE_ID)
        .map(([workspaceId, items]) => [
          workspaceId,
          Array.isArray(items)
            ? dedupeGhostTerminals(
                items
                  .filter(isStoredTerminalItem)
                  .map((terminal) => normalizeStoredTerminalItem(workspaceId, terminal)),
              )
            : [],
        ]),
    );

    const paneLayoutByWorkspaceId =
      parsed.paneLayoutByWorkspaceId && isRecord(parsed.paneLayoutByWorkspaceId)
        ? Object.fromEntries(
            Object.entries(parsed.paneLayoutByWorkspaceId).filter(
              ([workspaceId, layoutState]) =>
                workspaceId !== DETACHED_WORKSPACE_ID && isStoredWorkspacePaneLayoutState(layoutState),
            ),
          )
        : {};

    const workspaceTabStateByWorkspaceId =
      parsed.workspaceTabStateByWorkspaceId && isRecord(parsed.workspaceTabStateByWorkspaceId)
        ? Object.fromEntries(
            Object.entries(parsed.workspaceTabStateByWorkspaceId).filter(
              ([workspaceId, tabState]) =>
                workspaceId !== DETACHED_WORKSPACE_ID && isStoredShellWorkspaceTabState(tabState),
            ),
          )
        : {};

    return {
      paneLayoutByWorkspaceId,
      terminalsByWorkspaceId,
      selectedNodeIdByOrganization:
        parsed.selectedNodeIdByOrganization && typeof parsed.selectedNodeIdByOrganization === "object"
          ? (parsed.selectedNodeIdByOrganization as Record<string, string>)
          : {},
      workspaceTabStateByWorkspaceId,
    };
  } catch {
    return null;
  }
}

export function parseStoredTerminalRuntimeState(raw: string): StoredTerminalRuntimeState {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([workspaceId, items]) => [
        workspaceId,
        Array.isArray(items)
          ? items
              .filter(
                (item): item is StoredTerminalRuntimeItem =>
                  !!item &&
                  typeof item === "object" &&
                  typeof (item as Record<string, unknown>).id === "string" &&
                  ((item as Record<string, unknown>).session === undefined ||
                    (item as Record<string, unknown>).session === null ||
                    isStoredTerminalSession((item as Record<string, unknown>).session)) &&
                  ((item as Record<string, unknown>).cachedOutput === undefined ||
                    (item as Record<string, unknown>).cachedOutput === null ||
                    typeof (item as Record<string, unknown>).cachedOutput === "string") &&
                  ((item as Record<string, unknown>).lastMessagePreview === undefined ||
                    (item as Record<string, unknown>).lastMessagePreview === null ||
                    typeof (item as Record<string, unknown>).lastMessagePreview === "string") &&
                  ((item as Record<string, unknown>).status === undefined ||
                    typeof (item as Record<string, unknown>).status === "string"),
              )
              .map((item) => normalizeStoredRuntimeItem(workspaceId, item))
          : [],
      ]),
    );
  } catch {
    return {};
  }
}
