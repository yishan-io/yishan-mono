import type { AgentChatSessionView } from "@renderer/domains/workbench";
import type { TabStoreState } from "../../../domains/workbench";
import type { AgentRuntime, PiActiveSessionSummary } from "../daemon/daemonAgentTypes";
import { normalizeAgentChatRuntime } from "./agentRuntimeSelection";
import { buildAgentRuntimeSessionKey } from "./agentSessionIdentity";

type AgentChatTab = Extract<TabStoreState["tabs"][number], { kind: "agent-chat" }>;

type PersistedAgentChatTabEntry = {
  tabId: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
  cwd: string;
  sessionId: string;
  runtime?: AgentRuntime;
  userRenamed: boolean;
  sessionView: AgentChatSessionView;
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
    private readonly tabStoreAccess: {
      getState: () => TabStoreState;
      setState: (partial: Partial<TabStoreState>) => void;
      subscribe: (listener: (state: TabStoreState) => void) => () => void;
    },
    private readonly workspaceStoreAccess: {
      getState: () => { workspaces: Array<{ id: string }> };
    },
    private readonly storage: Storage | undefined = resolveBrowserStorage(),
  ) {}

  /** Restores persisted DSH tabs and live Pi tabs after an application restart. */
  async restoreAgentChatTabsFromDaemon(params: {
    listActivePiSessions: () => Promise<PiActiveSessionSummary[]>;
  }): Promise<AgentChatRecoveryResult> {
    const workspaceIdSet = new Set(this.workspaceStoreAccess.getState().workspaces.map((workspace) => workspace.id));
    if (workspaceIdSet.size === 0) {
      return {};
    }

    // DSH owns durable session history, so its persisted tab identity is enough
    // to resume lifecycle attach. Pi remains contingent on a live daemon session.
    const persisted = this.loadPersistedAgentChatTabs();
    let activeSessions: PiActiveSessionSummary[] = [];
    try {
      activeSessions = await params.listActivePiSessions();
    } catch {
      // A Pi discovery failure must not discard independently recoverable DSH tabs.
    }

    const state = this.tabStoreAccess.getState();
    const nextTabs = [...state.tabs];
    const existingTabIds = new Set(nextTabs.map((tab) => tab.id));
    const existingSessionKeys = new Set(
      nextTabs
        .filter((tab): tab is AgentChatTab => tab.kind === "agent-chat")
        .flatMap((tab) => {
          const sessionId = normalizeOptionalText(tab.data.sessionId);
          return sessionId
            ? [
                buildAgentRuntimeSessionKey(
                  normalizeAgentChatRuntime({ runtime: tab.data.runtime, sessionId }),
                  sessionId,
                ),
              ]
            : [];
        }),
    );
    const nextSelectedByWorkspaceId = { ...state.selectedTabIdByWorkspaceId };
    let fallbackWorkspaceId: string | undefined;

    const restoreTab = (entry: PersistedAgentChatTabEntry, session: PiActiveSessionSummary | undefined): void => {
      if (
        !workspaceIdSet.has(entry.workspaceId) ||
        existingTabIds.has(entry.tabId) ||
        existingSessionKeys.has(buildAgentRuntimeSessionKey(entry.runtime ?? "pi", entry.sessionId))
      ) {
        return;
      }

      const tab: AgentChatTab = {
        id: entry.tabId,
        workspaceId: entry.workspaceId,
        title: entry.title,
        pinned: entry.pinned,
        kind: "agent-chat",
        data: {
          cwd: session?.cwd ?? entry.cwd,
          sessionId: entry.sessionId,
          runtime: normalizeAgentChatRuntime({ runtime: entry.runtime, sessionId: entry.sessionId }),
          userRenamed: entry.userRenamed,
          sessionView: entry.sessionView,
        },
      };
      nextTabs.push(tab);
      existingTabIds.add(tab.id);
      existingSessionKeys.add(buildAgentRuntimeSessionKey(entry.runtime ?? "pi", entry.sessionId));
      if (!nextSelectedByWorkspaceId[entry.workspaceId]) {
        nextSelectedByWorkspaceId[entry.workspaceId] = entry.tabId;
        fallbackWorkspaceId ??= entry.workspaceId;
      }
    };

    for (const entry of persisted.tabs) {
      if (entry.runtime === "dsh") {
        restoreTab(entry, undefined);
      }
    }

    const persistedBySessionKey = new Map(
      persisted.tabs.map((entry) => [buildAgentRuntimeSessionKey(entry.runtime ?? "pi", entry.sessionId), entry]),
    );
    for (const session of activeSessions) {
      if (!workspaceIdSet.has(session.workspaceId) || !normalizeOptionalText(session.sessionId) || !session.cwd) {
        continue;
      }
      const persistedEntry = persistedBySessionKey.get(buildAgentRuntimeSessionKey("pi", session.sessionId));
      const entry: PersistedAgentChatTabEntry = persistedEntry ?? {
        tabId: normalizeOptionalText(session.tabId) ?? "",
        workspaceId: session.workspaceId,
        title: "Agent Chat",
        pinned: false,
        cwd: session.cwd,
        sessionId: session.sessionId,
        runtime: "pi",
        userRenamed: false,
        sessionView: "full",
      };
      restoreTab(entry, session);
    }

    const selectedRecoveredTab = persisted.selectedTabId
      ? nextTabs.find((tab) => tab.id === persisted.selectedTabId)
      : undefined;
    if (selectedRecoveredTab) {
      nextSelectedByWorkspaceId[selectedRecoveredTab.workspaceId] = selectedRecoveredTab.id;
    }
    const nextSelectedTabId = selectedRecoveredTab ? persisted.selectedTabId : state.selectedTabId;

    if (nextTabs.length === state.tabs.length) {
      return {};
    }

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
        runtime: normalizeAgentChatRuntime({ runtime: tab.data.runtime, sessionId }),
        userRenamed: Boolean(tab.data.userRenamed),
        sessionView: tab.data.sessionView ?? "full",
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
  const sessionView = entry.sessionView === "subagent-detail" ? "subagent-detail" : "full";
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
    runtime: normalizeAgentChatRuntime({ runtime: entry.runtime, sessionId }),
    userRenamed: Boolean(entry.userRenamed),
    sessionView,
  };
}
