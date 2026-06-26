import { type DesktopAgentKind, isDesktopAgentKind } from "../../../helpers/agentSettings";
import { generateId } from "../../../helpers/generateId";
import type { TerminalSessionSummary } from "../../../rpc/daemonTypes";
import { tabStore } from "../../../store/tabStore";
import type { TabStoreState } from "../../../store/tabStore";
import { workspaceStore } from "../../../store/workspaceStore";

type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;

type PersistedTerminalTabEntry = {
  tabId: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
  sessionId?: string;
  launchCommand?: string;
  agentKind?: string;
};

type PersistedTerminalTabPayload = {
  selectedTabId: string;
  tabs: PersistedTerminalTabEntry[];
};

const TERMINAL_RECOVERY_STORAGE_KEY = "yishan-terminal-recovery-v1";
const EMPTY_PERSISTED_TERMINAL_PAYLOAD: PersistedTerminalTabPayload = {
  selectedTabId: "",
  tabs: [],
};

/**
 * Coordinates terminal tab persistence and restore.
 */
export class TerminalRecoveryCoordinator {
  constructor(
    private readonly tabStoreAccess: Pick<typeof tabStore, "getState" | "setState" | "subscribe"> = tabStore,
    private readonly workspaceStoreAccess: Pick<typeof workspaceStore, "getState"> = workspaceStore,
    private readonly storage: Storage | undefined = resolveBrowserStorage(),
  ) {}

  /**
   * Restores terminal tabs from active daemon sessions, merging with localStorage data.
   * Returns workspace id for the selected tab after restore, if any.
   */
  async restoreTerminalTabsFromDaemon(params: {
    listTerminalSessions: () => Promise<TerminalSessionSummary[]>;
  }): Promise<string | undefined> {
    const workspaceIdSet = new Set(this.workspaceStoreAccess.getState().workspaces.map((workspace) => workspace.id));
    if (workspaceIdSet.size === 0) {
      return undefined;
    }

    let daemonSessions: TerminalSessionSummary[];
    try {
      daemonSessions = await params.listTerminalSessions();
    } catch {
      return undefined;
    }

    const activeSessions = daemonSessions.filter(
      (session) => session.status === "running" && workspaceIdSet.has(session.workspaceId),
    );
    if (activeSessions.length === 0) {
      return undefined;
    }

    const persisted = this.loadPersistedTerminalTabs();
    const persistedBySessionId = new Map<string, PersistedTerminalTabEntry>();
    for (const entry of persisted.tabs) {
      if (entry.sessionId) {
        persistedBySessionId.set(entry.sessionId, entry);
      }
    }

    const state = this.tabStoreAccess.getState();
    const existingTabIds = new Set(state.tabs.map((tab) => tab.id));
    const existingSessionIds = new Set(
      state.tabs
        .filter((tab): tab is TerminalTab => tab.kind === "terminal")
        .map((tab) => tab.data.sessionId)
        .filter(Boolean) as string[],
    );

    const unrestoredSessions = activeSessions.filter((session) => !existingSessionIds.has(session.sessionId));
    if (unrestoredSessions.length === 0) {
      return undefined;
    }

    const nextTabs = [...state.tabs];
    const nextSelectedByWorkspaceId = { ...state.selectedTabIdByWorkspaceId };
    let restoredSelectedTabWorkspaceId: string | undefined;

    for (const session of unrestoredSessions) {
      const persistedEntry = persistedBySessionId.get(session.sessionId);
      const tabId = persistedEntry?.tabId ?? generateId();
      const title = persistedEntry?.title ?? "Terminal";
      const pinned = persistedEntry?.pinned ?? false;
      const launchCommand = persistedEntry?.launchCommand;
      const rawAgentKind = persistedEntry?.agentKind;
      const agentKind: DesktopAgentKind | undefined = isDesktopAgentKind(rawAgentKind ?? "")
        ? (rawAgentKind as DesktopAgentKind)
        : undefined;

      if (existingTabIds.has(tabId)) {
        continue;
      }

      const tab: TerminalTab = {
        id: tabId,
        workspaceId: session.workspaceId,
        title,
        pinned,
        kind: "terminal" as const,
        data: {
          title,
          sessionId: session.sessionId,
          launchCommand,
          agentKind,
        },
      };

      nextTabs.push(tab);
      existingTabIds.add(tabId);

      if (!nextSelectedByWorkspaceId[session.workspaceId]) {
        nextSelectedByWorkspaceId[session.workspaceId] = tabId;
        restoredSelectedTabWorkspaceId = session.workspaceId;
      }
    }

    const shouldRestoreSelectedTab =
      persisted.selectedTabId && nextTabs.some((tab) => tab.id === persisted.selectedTabId);
    const nextSelectedTabId = shouldRestoreSelectedTab ? persisted.selectedTabId : state.selectedTabId;

    this.tabStoreAccess.setState({
      tabs: nextTabs,
      selectedTabIdByWorkspaceId: nextSelectedByWorkspaceId,
      selectedTabId: nextSelectedTabId,
    });

    const restoredState = this.tabStoreAccess.getState();
    if (this.storage) {
      this.storage.setItem(
        TERMINAL_RECOVERY_STORAGE_KEY,
        JSON.stringify(this.buildPersistedTerminalTabsPayload(restoredState)),
      );
    }

    return restoredSelectedTabWorkspaceId;
  }

  /**
   * Starts auto-persisting terminal-tab metadata and returns the unsubscribe handle.
   */
  startPersistingTerminalTabs(): () => void {
    let previousPayload = this.buildPersistedTerminalTabsPayload(this.tabStoreAccess.getState());

    return this.tabStoreAccess.subscribe((state) => {
      const nextPayload = this.buildPersistedTerminalTabsPayload(state);
      if (persistedTerminalPayloadsEqual(previousPayload, nextPayload)) {
        return;
      }

      previousPayload = nextPayload;
      if (!this.storage) {
        return;
      }

      this.storage.setItem(TERMINAL_RECOVERY_STORAGE_KEY, JSON.stringify(nextPayload));
    });
  }

  /** Reads persisted terminal tabs from local storage with strict validation. */
  private loadPersistedTerminalTabs(): PersistedTerminalTabPayload {
    if (!this.storage) {
      return EMPTY_PERSISTED_TERMINAL_PAYLOAD;
    }

    try {
      const raw = this.storage.getItem(TERMINAL_RECOVERY_STORAGE_KEY);
      if (!raw) {
        return EMPTY_PERSISTED_TERMINAL_PAYLOAD;
      }

      const parsed = JSON.parse(raw) as {
        selectedTabId?: unknown;
        tabs?: unknown;
      };
      const selectedTabId = typeof parsed.selectedTabId === "string" ? parsed.selectedTabId : "";
      const tabs = Array.isArray(parsed.tabs)
        ? parsed.tabs
            .map((entry) => normalizePersistedTerminalTabEntry(entry))
            .filter((entry): entry is PersistedTerminalTabEntry => Boolean(entry))
        : [];

      return {
        selectedTabId,
        tabs,
      };
    } catch {
      return EMPTY_PERSISTED_TERMINAL_PAYLOAD;
    }
  }

  /** Builds the persisted terminal-tab payload from current tab-store state. */
  private buildPersistedTerminalTabsPayload(
    state: Pick<TabStoreState, "tabs" | "selectedTabId">,
  ): PersistedTerminalTabPayload {
    return {
      selectedTabId: resolveSelectedTerminalTabId(state),
      tabs: state.tabs
        .filter((tab): tab is TerminalTab => tab.kind === "terminal")
        .map((tab) => ({
          tabId: tab.id,
          workspaceId: tab.workspaceId,
          title: tab.title,
          pinned: tab.pinned,
          sessionId: normalizeOptionalText(tab.data.sessionId),
          launchCommand: normalizeOptionalText(tab.data.launchCommand),
          agentKind: normalizeOptionalText(tab.data.agentKind),
        })),
    };
  }
}

/** Resolves one browser storage object when runtime environment supports localStorage. */
function resolveBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

/** Normalizes one optional text field and returns undefined for blank values. */
function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/** Parses and validates one persisted terminal tab entry. */
function normalizePersistedTerminalTabEntry(value: unknown): PersistedTerminalTabEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const entry = value as Partial<PersistedTerminalTabEntry>;
  const tabId = normalizeOptionalText(entry.tabId);
  const workspaceId = normalizeOptionalText(entry.workspaceId);
  const title = normalizeOptionalText(entry.title);
  if (!tabId || !workspaceId || !title) {
    return undefined;
  }

  return {
    tabId,
    workspaceId,
    title,
    pinned: Boolean(entry.pinned),
    sessionId: normalizeOptionalText(entry.sessionId),
    launchCommand: normalizeOptionalText(entry.launchCommand),
    agentKind: normalizeOptionalText(entry.agentKind),
  };
}

function resolveSelectedTerminalTabId(state: Pick<TabStoreState, "tabs" | "selectedTabId">): string {
  const selectedTab = state.tabs.find((tab) => tab.id === state.selectedTabId);
  return selectedTab?.kind === "terminal" ? selectedTab.id : "";
}

function persistedTerminalPayloadsEqual(
  left: PersistedTerminalTabPayload,
  right: PersistedTerminalTabPayload,
): boolean {
  if (left.selectedTabId !== right.selectedTabId) {
    return false;
  }
  if (left.tabs.length !== right.tabs.length) {
    return false;
  }

  for (let index = 0; index < left.tabs.length; index += 1) {
    const leftEntry = left.tabs[index];
    const rightEntry = right.tabs[index];
    if (!leftEntry || !rightEntry) {
      return false;
    }
    if (
      leftEntry.tabId !== rightEntry.tabId ||
      leftEntry.workspaceId !== rightEntry.workspaceId ||
      leftEntry.title !== rightEntry.title ||
      leftEntry.pinned !== rightEntry.pinned ||
      leftEntry.sessionId !== rightEntry.sessionId ||
      leftEntry.launchCommand !== rightEntry.launchCommand
    ) {
      return false;
    }
  }

  return true;
}
