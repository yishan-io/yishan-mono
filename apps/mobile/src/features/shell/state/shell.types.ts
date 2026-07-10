import type { AgentKind } from "@yishan/core";

import type { WorkspaceGitChangeKind, WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";
import type { SplitPaneStateSlice } from "./split-pane/types";
export type { PaneBranch, PaneLeaf, SplitDirection, SplitPaneNode } from "./split-pane/types";

export type ShellSelection =
  | { kind: "home" }
  | {
      kind: "workspace";
      orgId: string;
      projectId: string;
      workspaceId: string;
    };

export type ShellFocusPreview =
  | null
  | {
      kind: "file";
      path: string;
    }
  | {
      kind: "diff";
      path: string;
      changeKind: WorkspaceGitChangeKind;
    };

export type ShellPaneTab =
  | {
      id: string;
      kind: "terminal";
      terminalId: string;
    }
  | {
      id: string;
      kind: "file";
      path: string;
    }
  | {
      id: string;
      kind: "diff";
      path: string;
      changeKind: WorkspaceGitChangeKind;
    };

export type ShellWorkspaceTabDataByKind = {
  terminal: {
    terminalId: string;
    title: string;
    paneId?: string;
    sessionId?: WorkspaceTerminalSession["sessionId"];
    launchCommand?: string | null;
    agentKind?: AgentKind;
    userRenamed?: boolean;
  };
  file: {
    path: string;
    isTemporary: boolean;
  };
  diff: {
    path: string;
    changeKind: WorkspaceGitChangeKind;
    isTemporary: boolean;
  };
};

export type ShellWorkspaceTab =
  | {
      id: string;
      workspaceId: string;
      title: string;
      pinned: boolean;
      kind: "terminal";
      data: ShellWorkspaceTabDataByKind["terminal"];
    }
  | {
      id: string;
      workspaceId: string;
      title: string;
      pinned: boolean;
      kind: "file";
      data: ShellWorkspaceTabDataByKind["file"];
    }
  | {
      id: string;
      workspaceId: string;
      title: string;
      pinned: boolean;
      kind: "diff";
      data: ShellWorkspaceTabDataByKind["diff"];
    };

export type OpenShellWorkspaceTabInput =
  | {
      workspaceId?: string;
      kind: "terminal";
      terminalId: string;
      title?: string;
      paneId?: string;
      sessionId?: WorkspaceTerminalSession["sessionId"];
      launchCommand?: string | null;
      agentKind?: AgentKind;
      userRenamed?: boolean;
      reuseExisting?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "file";
      path: string;
      temporary?: boolean;
    }
  | {
      workspaceId?: string;
      kind: "diff";
      path: string;
      changeKind: WorkspaceGitChangeKind;
      temporary?: boolean;
    };

export type ShellWorkspaceTabState = {
  workspaceId: string;
  tabs: ShellWorkspaceTab[];
  selectedTabId: string;
};

export type WorkspacePaneLayoutState = SplitPaneStateSlice;

export type WorkspacePaneStoreState = {
  tabState: ShellWorkspaceTabState;
  layoutState: WorkspacePaneLayoutState;
};

export type TerminalStatus = "initializing" | "idle" | "running" | "waiting_input" | "error";

export type TerminalBackendSession = {
  sessionId: WorkspaceTerminalSession["sessionId"];
  workspaceId: WorkspaceTerminalSession["workspaceId"];
  tabId?: WorkspaceTerminalSession["tabId"];
  paneId?: WorkspaceTerminalSession["paneId"];
  status: WorkspaceTerminalSession["status"];
  pid?: WorkspaceTerminalSession["pid"];
  startedAt?: WorkspaceTerminalSession["startedAt"];
  exitedAt?: WorkspaceTerminalSession["exitedAt"];
};

export type TerminalMessagePart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "thinking";
      text: string;
    }
  | {
      type: "tool_call";
      toolName: string;
      argumentsText?: string;
      status: "pending" | "running" | "completed" | "failed";
    }
  | {
      type: "tool_result";
      toolName: string;
      outputText: string;
      isError?: boolean;
    };

export type TerminalMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  createdAt: string;
  status?: "streaming" | "completed" | "error";
  parts: TerminalMessagePart[];
};

export type TerminalItem = {
  id: string;
  cachedOutput?: string | null;
  importedFromBackend?: boolean;
  session?: TerminalBackendSession | null;
  agentKind?: AgentKind;
  launchCommand?: string | null;
  orgId: string;
  projectId: string;
  workspaceId: string;
  nodeId?: string | null;
  label: string;
  subtitle?: string | null;
  updatedAt: string;
  createdAt?: string;
  status?: TerminalStatus;
  modelId?: string | null;
  lastMessagePreview?: string | null;
  userRenamed?: boolean;
};

export type WorkspaceFileItem = {
  path: string;
  name: string;
  isDir: boolean;
};

export type TerminalMap = Record<string, TerminalItem>;
