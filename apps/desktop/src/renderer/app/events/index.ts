/**
 * Event composition — starts all feature event handlers and returns a
 * combined teardown. This replaces `backendEventStoreBindings.ts`.
 *
 * Transport decoding lives in `backendEventAdapter.ts`, event selection in
 * `backendEventRouter.ts` (+ per-family selectors). Each feature handler
 * receives its router subscriptions from here (dependency injection), so
 * Domains never import app (Domains plan D7/D8).
 */
import { incrementFileTreeRefreshVersion } from "@renderer/domains/files";
import { incrementGitRefreshVersion } from "@renderer/domains/git";
import { resetAgentLifecycleState } from "../../domains/agent/commands/agentSessionLifecycle";
import { createNotificationEventHandlers } from "../../domains/notification/events/notificationEventHandlers";
import { createTerminalEventHandlers } from "../../domains/terminal/events/terminalEventHandlers";
import { createWorkbenchEventHandlers } from "../../domains/workbench/events/workbenchEventHandlers";
import { createWorkspaceEventHandlers } from "../../domains/workspace/events/workspaceEventHandlers";
import { loadWorkspaceSnapshot } from "../flows/workspaceSnapshotFlow";
import { subscribeBackendEvent } from "./backendEventRouter";

/**
 * Starts all feature event handlers and returns one teardown function.
 * Mirrors the former `startBackendEventStoreBindings` behavior exactly.
 */
export function startBackendEventHandlers() {
  // App composes the backend-event subscriptions + the workspace-snapshot
  // flow into the Workspace handler (Workspace never imports app; D8).
  const stopWorkspaceEventHandlers = createWorkspaceEventHandlers({
    incrementFileTreeRefreshVersion,
    incrementGitRefreshVersion,
    subscribeGitChanged: (listener) =>
      subscribeBackendEvent("git.changed", (event) => {
        if (event.source !== "gitChanged") {
          return;
        }
        listener(
          event.payload.workspaceId,
          event.payload.workspaceWorktreePath,
          event.payload.affectsBranch ?? true,
          event.payload.currentBranch,
        );
      }),
    subscribeWorkspaceFilesChanged: (listener) =>
      subscribeBackendEvent("workspace.files.changed", (event) => {
        if (event.source !== "workspaceFilesChanged") {
          return;
        }
        listener(event.payload.workspaceId, event.payload.workspaceWorktreePath, event.payload.changedRelativePaths);
      }),
    subscribeWorkspaceCreateStarted: (listener) =>
      subscribeBackendEvent("workspace.create.started", (event) => {
        if (event.source !== "workspaceCreateStarted") {
          return;
        }
        listener(event.payload);
      }),
    subscribeWorkspaceCreateProgress: (listener) =>
      subscribeBackendEvent("workspace.create.progress", (event) => {
        if (event.source !== "workspaceCreateProgress") {
          return;
        }
        listener(event.payload);
      }),
    subscribeWorkspaceCreateCompleted: (listener) =>
      subscribeBackendEvent("workspace.create.completed", (event) => {
        if (event.source !== "workspaceCreateCompleted") {
          return;
        }
        listener(event.payload);
      }),
    subscribeWorkspaceCreateFailed: (listener) =>
      subscribeBackendEvent("workspace.create.failed", (event) => {
        if (event.source !== "workspaceCreateFailed") {
          return;
        }
        listener(event.payload);
      }),
    subscribeWorkspacePullRequestUpdated: (listener) =>
      subscribeBackendEvent("workspace.pull_request.updated", (event) => {
        if (event.source !== "workspacePullRequestUpdated") {
          return;
        }
        listener(event.payload);
      }),
    subscribeWorkspaceSnapshotChanged: (listener) =>
      subscribeBackendEvent("workspace.snapshot.changed", (event) => {
        if (event.source !== "workspaceSnapshotChanged") {
          return;
        }
        listener(event.payload);
      }),
    subscribeWorkspaceStateChanged: (listener) =>
      subscribeBackendEvent("workspace.state.changed", (event) => {
        if (event.source !== "workspaceStateChanged") {
          return;
        }
        listener(event.payload);
      }),
    loadWorkspaceSnapshot,
  })();
  const stopNotificationEventHandlers = createNotificationEventHandlers({
    subscribeInAppNotification: (listener) =>
      subscribeBackendEvent("notification.event", (event) => {
        if (event.source !== "notificationEvent") {
          return;
        }
        listener(event.payload);
      }),
  })();
  const stopTerminalEventHandlers = createTerminalEventHandlers({
    subscribeTerminalSessionChanged: (listener) =>
      subscribeBackendEvent("terminal.session.changed", (event) => {
        if (event.source !== "terminalSessionChanged") {
          return;
        }
        listener(event.payload);
      }),
    subscribeTerminalAgentChanged: (listener) =>
      subscribeBackendEvent("terminal.agent.changed", (event) => {
        if (event.source !== "terminalAgentChanged") {
          return;
        }
        listener(event.payload);
      }),
  })();
  // App composes the backend-event subscription into the Workbench handler
  // (Workbench never imports app; Domains plan D7).
  const stopWorkbenchEventHandlers = createWorkbenchEventHandlers({
    subscribeOpenBrowserUrl: (listener) =>
      subscribeBackendEvent("open.browser.url", (event) => {
        if (event.source !== "openBrowserUrl") {
          return;
        }
        listener(event.payload);
      }),
  })();

  return () => {
    stopWorkspaceEventHandlers();
    stopNotificationEventHandlers();
    stopTerminalEventHandlers();
    stopWorkbenchEventHandlers();
    resetAgentLifecycleState();
  };
}
