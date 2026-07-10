import type { Node } from "@/features/nodes/nodes.types";
import type { WorkspaceAggregateIndicator } from "@/features/notifications/notification-runtime-context";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { ShellSelection, TerminalItem, TerminalMessage } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";

/**
 * Status badge data rendered beside the shell top-bar subtitle.
 */
export type ShellTopBarSubtitleStatus = {
  workspaceId: string;
  workspaceKind: Workspace["kind"];
};

/**
 * Screen-ready data for the shell top bar.
 */
export type ShellDrawerTopBarModel = {
  aggregateIndicator?: WorkspaceAggregateIndicator;
  onOpenBrowser?: (() => void) | null;
  onOpenQuickActions?: (() => void) | null;
  onRefreshSessions?: (() => void) | null;
  refreshingSessions?: boolean;
  sessionSyncError?: boolean;
  subtitle?: string | null;
  subtitleStatus?: ShellTopBarSubtitleStatus | null;
  title: string;
};

/**
 * Screen-ready data for the shell drawer panel.
 */
export type ShellDrawerPanelModel = {
  currentNodes: Node[];
  currentOrganizationId: string | null;
  currentOrganizationName: string;
  currentProjects: ProjectWithWorkspaces[] | undefined;
  isProjectsError: boolean;
  isProjectsLoading: boolean;
  isReadOnly?: boolean;
  onOpenProfileControls: () => void;
  onOpenOrganizationSelector: () => void;
  onOpenProjectMenu: (project: ProjectWithWorkspaces) => void;
  onOpenWorkspaceMenu: (project: ProjectWithWorkspaces, workspace: Workspace) => void;
  onRefreshWorkspaceTree?: (() => void) | null;
  onRetryProjects?: () => void;
  organizationCount: number;
  refreshingWorkspaceTree?: boolean;
  selectedSelection: Extract<ShellSelection, { kind: "workspace" }> | null;
  userAvatarUrl?: string | null;
  userName: string;
  workspacesByProjectId?: Record<string, Workspace[]>;
};

/**
 * Screen-ready data for the shell chat surface.
 */
export type ShellChatModel = {
  agentQuickActions?: Array<{ id: string; label: string; onPress: () => void }> | null;
  draft: string;
  messages: TerminalMessage[];
  onCreateTerminal?: (() => void) | null;
  onDraftChange: (value: string) => void;
  onOpenChanges?: (() => void) | null;
  onOpenFiles?: (() => void) | null;
  onOpenPaneTabs?: (() => void) | null;
  onOpenPullRequests?: (() => void) | null;
  onSend: (draft: string) => void;
  onTerminalInput: (data: string) => void;
  onTerminalResize: (size: { cols: number; rows: number }) => void;
  selectedTerminal: TerminalItem | null;
  selectedTerminalTitle?: string | null;
  terminalOutput: string;
  workspaceLocalPath?: string | null;
};

/**
 * Workspace context required to render non-terminal preview tabs.
 */
export type ShellFocusPanePreviewContext = {
  nodeId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
};
