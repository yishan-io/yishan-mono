import type { NotificationEventType } from "../notifications/notificationPreferences";
import type { AppActionPayload } from "./actions";

export type RpcSchema = {
  toFrontend: {
    messages: {
      appAction: AppActionPayload;
      chatEvent: {
        workspaceId: string;
        sessionId: string;
        event: {
          type: string;
          text?: string;
          message?: string;
          code?: string;
          exitCode?: number;
          [key: string]: unknown;
        };
      };
      notificationEvent: {
        id: string;
        title: string;
        body?: string;
        tone: "success" | "error";
        createdAt: string;
        agent?: string;
        workspaceId?: string;
        workspaceName?: string;
        sessionId?: string;
        navigationPath?: string;
        notificationEventType?: NotificationEventType;
        silent?: boolean;
        showSystemNotification?: boolean;
        soundToPlay?: {
          soundId: "chime" | "ping" | "pop" | "zip" | "alert";
          volume: number;
        };
        observerStatus?: {
          normalizedEventType: "start" | "wait_input" | "stop" | "unknown";
          sessionKey: string;
        };
      };
      gitChanged: {
        workspaceWorktreePath: string;
        /** True when the change is branch-relevant (HEAD or refs/heads). False for index/FETCH_HEAD/etc. */
        affectsBranch?: boolean;
        /** Current branch name, pushed by the daemon when affectsBranch is true. */
        currentBranch?: string;
      };
      workspaceFilesChanged: {
        workspaceWorktreePath: string;
        changedRelativePaths?: string[];
      };
      workspaceCreateProgress: {
        workspaceId: string;
        stepId: string;
        label: string;
        status: "pending" | "running" | "completed" | "failed" | "skipped" | "warning";
        message?: string;
        createdAt: string;
      };
      workspaceCreateCompleted: {
        workspaceId: string;
        worktreePath: string;
        lifecycleScriptWarnings?: unknown[];
        remoteSyncWarning?: string;
      };
      workspacePullRequestUpdated: {
        workspaceId: string;
        workspaceWorktreePath: string;
        pullRequest?: {
          number: number;
          title?: string;
          url?: string;
          branch?: string;
          baseBranch?: string;
          githubState?: string;
          status?: string;
          reviewDecision?: string;
          isDraft?: boolean;
          complete?: boolean;
          updatedAt?: string;
          checks?: Array<{
            name: string;
            workflow?: string;
            state: string;
            description?: string;
            url?: string;
          }>;
          deployments?: Array<{
            id: number;
            environment?: string;
            state?: string;
            description?: string;
            environmentUrl?: string;
            createdAt?: string;
            updatedAt?: string;
            originalPayload?: string;
          }>;
        };
      };
      workspaceSnapshotChanged: {
        organizationId: string;
        resource: "project" | "workspace";
        change: "created" | "updated" | "deleted" | "closed";
        projectId?: string;
        workspaceId?: string;
      };
      openBrowserUrl: {
        url: string;
        workspaceId: string;
        tabId: string;
        paneId: string;
      };
    };
  };
};

export type RpcFrontendMessageKey = keyof RpcSchema["toFrontend"]["messages"];
export type RpcFrontendMessagePayload<Key extends RpcFrontendMessageKey> = RpcSchema["toFrontend"]["messages"][Key];
