import type { PiActiveSessionSummary } from "../../rpc/daemonTypes";
import { tabStore } from "../../store/tabStore";
import type { TabStoreState } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";

type AgentChatTab = Extract<TabStoreState["tabs"][number], { kind: "agent-chat" }>;

type PersistedAgentChatTabEntry = {
  tabId: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
  cwd: string;
  sessionId: string;
  userRenamed: boolean;
};

type PersistedAgentChatTabPayload = {
  selectedTabId: string;
  tabs: PersistedAgentChatTabEntry[];
};

type AgentChatRecoveryResult = {
  selectedWorkspaceId?: string;
  fallbackWorkspaceId?: string;
};

const AGENT_CHAT_RECOVERY_STORAGE_KEY = "yishan-agent-chat-recovery-v1";
const EMPTY_PERSISTED_AGENT_CHAT_PAYLOAD: PersistedAgentChatTabPayload = {
  selectedTabId: "",
  tabs: [],
};

/** Coordinates persistence and restore for live agent-chat tabs. */
export class AgentChatRecoveryCoordinator {
  constructor(
    private readonly tabStoreAccess: Pick<typeof tabStore, "getState" | "setState" | "subscribe"> = tabStore,
    private readonly workspaceStoreAccess: Pick<typeof workspaceStore, "getState"> = workspaceStore,
    private readonly storage: Storage | undefined = resolveBrowserStorage(),
  ) {}

  /** Restores agent-chat tabs from active daemon Pi sessions. */
  async restoreAgentChatTabsFromDaemon(params: {
    listActivePiSessions: () => Promise<PiActiveSessionSummary[]>;
  }): Promise<AgentChatRecoveryResult> {
    const workspaceIdSet = new Set(this.workspaceStoreAccess.getState().workspaces.map((workspace) => workspace.id));
    if (workspaceIdSet.size === 0) {
      return {};
    }

    let activeSessions: PiActiveSessionSummary[];
    try {
      activeSessions = await params.listActivePiSessions();
    } catch {
      return {};
    }

    const recoverableSessions = activeSessions.filter(
      (session) => workspaceIdSet.has(session.workspaceId) && normalizeOptionalText(session.sessionId) && session.cwd,
    );
    if (recoverableSessions.length === 0) {
      return {};
    }

    const persisted = this.loadPersistedAgentChatTabs();
    const persistedBySessionId = new Map<string, PersistedAgentChatTabEntry>();
    for (const entry of persisted.tabs) {
      persistedBySessionId.set(entry.sessionId, entry);
    }

    const state = this.tabStoreAccess.getState();
    const existingTabIds = new Set(state.tabs.map((tab) => tab.id));
    const existingSessionIds = new Set(
      state.tabs
        .filter((tab): tab is AgentChatTab => tab.kind === "agent-chat")
        .map((tab) => tab.data.sessionId)
        .filter(Boolean) as string[],
    );

    const unrestoredSessions = recoverableSessions.filter((session) => !existingSessionIds.has(session.sessionId));
    if (unrestoredSessions.length === 0) {
      return {};
    }

    const nextTabs = [...state.tabs];
    const nextSelectedByWorkspaceId = { ...state.selectedTabIdByWorkspaceId };
    let fallbackWorkspaceId: string | undefined;

    for (const session of unrestoredSessions) {
      const persistedEntry = persistedBySessionId.get(session.sessionId);
      const tabId = persistedEntry?.tabId ?? normalizeOptionalText(session.tabId);
      if (!tabId || existingTabIds.has(tabId)) {
        continue;
      }

      const tab: AgentChatTab = {
        id: tabId,
        workspaceId: session.workspaceId,
        title: persistedEntry?.title ?? "Agent Chat",
        pinned: persistedEntry?.pinned ?? false,
        kind: "agent-chat",
        data: {
          cwd: session.cwd,
          sessionId: session.sessionId,
          userRenamed: persistedEntry?.userRenamed ?? false,
        },
      };

      nextTabs.push(tab);
      existingTabIds.add(tabId);

      if (!nextSelectedByWorkspaceId[session.workspaceId]) {
        nextSelectedByWorkspaceId[session.workspaceId] = tabId;
        fallbackWorkspaceId ??= session.workspaceId;
      }
    }

    const selectedRecoveredTab = persisted.selectedTabId
      ? nextTabs.find((tab) => tab.id === persisted.selectedTabId)
      : undefined;
    const shouldRestoreSelectedTab = Boolean(selectedRecoveredTab);
    if (selectedRecoveredTab) {
      nextSelectedByWorkspaceId[selectedRecoveredTab.workspaceId] = selectedRecoveredTab.id;
    }
    const nextSelectedTabId = shouldRestoreSelectedTab ? persisted.selectedTabId : state.selectedTabId;

    this.tabStoreAccess.setState({
      tabs: nextTabs,
      selectedTabIdByWorkspaceId: nextSelectedByWorkspaceId,
      selectedTabId: nextSelectedTabId,
    });

    const restoredState = this.tabStoreAccess.getState();
    if (this.storage) {
      this.storage.setItem(
        AGENT_CHAT_RECOVERY_STORAGE_KEY,
        JSON.stringify(this.buildPersistedAgentChatTabsPayload(restoredState)),
      );
    }

    return {
      selectedWorkspaceId: selectedRecoveredTab?.workspaceId,
      fallbackWorkspaceId,
    };
  }

  /** Starts auto-persisting live agent-chat tab metadata. */
  startPersistingAgentChatTabs(): () => void {
    let previousSerializedPayload = JSON.stringify(
      this.buildPersistedAgentChatTabsPayload(this.tabStoreAccess.getState()),
    );

    return this.tabStoreAccess.subscribe((state) => {
      const nextSerializedPayload = JSON.stringify(this.buildPersistedAgentChatTabsPayload(state));
      if (nextSerializedPayload === previousSerializedPayload) {
        return;
      }

      previousSerializedPayload = nextSerializedPayload;
      if (!this.storage) {
        return;
      }

      this.storage.setItem(AGENT_CHAT_RECOVERY_STORAGE_KEY, nextSerializedPayload);
    });
  }

  private loadPersistedAgentChatTabs(): PersistedAgentChatTabPayload {
    if (!this.storage) {
      return EMPTY_PERSISTED_AGENT_CHAT_PAYLOAD;
    }

    try {
      const raw = this.storage.getItem(AGENT_CHAT_RECOVERY_STORAGE_KEY);
      if (!raw) {
        return EMPTY_PERSISTED_AGENT_CHAT_PAYLOAD;
      }

      const parsed = JSON.parse(raw) as {
        selectedTabId?: unknown;
        tabs?: unknown;
      };
      const selectedTabId = typeof parsed.selectedTabId === "string" ? parsed.selectedTabId : "";
      const tabs = Array.isArray(parsed.tabs)
        ? parsed.tabs
            .map((entry) => normalizePersistedAgentChatTabEntry(entry))
            .filter((entry): entry is PersistedAgentChatTabEntry => Boolean(entry))
        : [];

      return {
        selectedTabId,
        tabs,
      };
    } catch {
      return EMPTY_PERSISTED_AGENT_CHAT_PAYLOAD;
    }
  }

  private buildPersistedAgentChatTabsPayload(
    state: Pick<TabStoreState, "tabs" | "selectedTabId">,
  ): PersistedAgentChatTabPayload {
    const tabs: PersistedAgentChatTabEntry[] = [];

    for (const tab of state.tabs) {
      if (tab.kind !== "agent-chat") {
        continue;
      }

      const sessionId = normalizeOptionalText(tab.data.sessionId);
      if (!sessionId) {
        continue;
      }

      tabs.push({
        tabId: tab.id,
        workspaceId: tab.workspaceId,
        title: tab.title,
        pinned: tab.pinned,
        cwd: tab.data.cwd,
        sessionId,
        userRenamed: Boolean(tab.data.userRenamed),
      });
    }

    return {
      selectedTabId: state.selectedTabId,
      tabs,
    };
  }
}

function resolveBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizePersistedAgentChatTabEntry(value: unknown): PersistedAgentChatTabEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const entry = value as Partial<PersistedAgentChatTabEntry>;
  const tabId = normalizeOptionalText(entry.tabId);
  const workspaceId = normalizeOptionalText(entry.workspaceId);
  const title = normalizeOptionalText(entry.title);
  const cwd = normalizeOptionalText(entry.cwd);
  const sessionId = normalizeOptionalText(entry.sessionId);
  if (!tabId || !workspaceId || !title || !cwd || !sessionId) {
    return undefined;
  }

  return {
    tabId,
    workspaceId,
    title,
    pinned: Boolean(entry.pinned),
    cwd,
    sessionId,
    userRenamed: Boolean(entry.userRenamed),
  };
}
