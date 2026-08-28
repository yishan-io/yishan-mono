import type { AgentRuntime, DesktopAgentKind } from "@renderer/domains/agent";

export type TabStoreStateSlice = {
  tabs: WorkbenchTab[];
  selectedTabId: string;
  selectedTabIdByWorkspaceId: Record<string, string>;
};

/**
 * Workbench Tab types (desktop6-adjust.md W1 task 8).
 *
 * Split from `features/workbench/types.ts` so the generic types file no
 * longer owns tab presentation vocabulary. These are Workbench-owned
 * presentation types; resource identifiers live in tab descriptors but the
 * tabs do not own another module's mutable state.
 */

export type DiffFileChangeKind = "added" | "modified" | "deleted" | "renamed";

export type DiffTabSource =
  | { kind: "workspace" }
  | { kind: "commit"; commitHash: string }
  | { kind: "branch"; targetBranch: string };

export type FileDiffEntry = {
  path: string;
  oldContent: string;
  newContent: string;
  changeKind: DiffFileChangeKind;
  additions: number;
  deletions: number;
};

/** Visual mode for one agent-chat tab/session attachment. */
export type AgentChatSessionView = "full" | "subagent-detail";

export type WorkbenchTabDataByKind = {
  diff: {
    path: string;
    source?: DiffTabSource;
    isTemporary: boolean;
  };
  file: {
    path: string;
    isDirty: boolean;
    isTemporary: boolean;
  };
  image: { path: string; dataUrl: string; isTemporary: boolean };
  video: { path: string; dataUrl: string; isTemporary: boolean };
  audio: { path: string; dataUrl: string; isTemporary: boolean };
  terminal: {
    title: string;
    /** Stable terminal pane identity used by observer correlation. */
    paneId?: string;
    /** Backend terminal runtime session id bound to this tab. */
    sessionId?: string;
    launchCommand?: string;
    agentKind?: DesktopAgentKind;
    /** When true, auto-rename from terminal commands/paths is suppressed. */
    userRenamed?: boolean;
  };
  browser: {
    url: string;
    faviconUrl?: string;
  };
  "agent-chat": {
    /** Single source of truth for agent-chat identity: one live/runtime session id per tab. */
    sessionId?: string;
    /** Selected execution runtime; missing legacy records normalize to Pi. */
    runtime?: AgentRuntime;
    cwd: string;
    userRenamed?: boolean;
    sessionView?: AgentChatSessionView;
    subagentAgentId?: string;
    subagentParentSessionId?: string;
    /** For DSH sessions: the user-selected model id to use for the next session start. */
    dshSelectedModelId?: string;
    /** Provider route paired with dshSelectedModelId. */
    dshSelectedProviderId?: string;
  };
};

export type WorkbenchTabBase = {
  id: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
};

export type WorkbenchTab =
  | (WorkbenchTabBase & {
      kind: "diff";
      data: WorkbenchTabDataByKind["diff"];
    })
  | (WorkbenchTabBase & {
      kind: "file";
      data: WorkbenchTabDataByKind["file"];
    })
  | (WorkbenchTabBase & {
      kind: "image";
      data: WorkbenchTabDataByKind["image"];
    })
  | (WorkbenchTabBase & {
      kind: "video";
      data: WorkbenchTabDataByKind["video"];
    })
  | (WorkbenchTabBase & {
      kind: "audio";
      data: WorkbenchTabDataByKind["audio"];
    })
  | (WorkbenchTabBase & {
      kind: "terminal";
      data: WorkbenchTabDataByKind["terminal"];
    })
  | (WorkbenchTabBase & {
      kind: "browser";
      data: WorkbenchTabDataByKind["browser"];
    })
  | (WorkbenchTabBase & {
      kind: "agent-chat";
      data: WorkbenchTabDataByKind["agent-chat"];
    });

export type OpenTabInput =
  | {
      workspaceId?: string;
      kind: "diff";
      path: string;
      changeKind: DiffFileChangeKind;
      additions: number;
      deletions: number;
      oldContent?: string;
      newContent?: string;
      diffSource?: DiffTabSource;
      temporary?: boolean;
      files?: FileDiffEntry[];
    }
  | {
      workspaceId?: string;
      kind: "file";
      path: string;
      content?: string;
      temporary?: boolean;
      isUnsupported?: boolean;
      unsupportedReason?: "type" | "size";
      /** When true, diff gutter decorations will be suppressed for this file. */
      isIgnored?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "image";
      path: string;
      dataUrl: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "video";
      path: string;
      dataUrl: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "audio";
      path: string;
      dataUrl: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "terminal";
      title?: string;
      sessionId?: string;
      launchCommand?: string;
      agentKind?: DesktopAgentKind;
      reuseExisting?: boolean;
      tabId?: string;
      paneId?: string;
    }
  | {
      workspaceId?: string;
      kind: "browser";
      url?: string;
      reuseExisting?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "agent-chat";
      title?: string;
      /** Working directory for the pi agent process. Defaults to workspace worktree path. */
      cwd?: string;
      /** Single session id used for both live attach and persisted Pi resume. */
      sessionId?: string;
      runtime?: AgentRuntime;
      sessionView?: AgentChatSessionView;
      subagentAgentId?: string;
      subagentParentSessionId?: string;
      /** Caller-provided stable identity for daemon-created agent-chat tabs. */
      tabId?: string;
    };
