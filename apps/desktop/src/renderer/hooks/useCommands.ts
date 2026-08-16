import { useMemo } from "react";
import {
  createAgentCommands,
  createAppCommands,
  createCommands,
  createFileCommands,
  createGitCommands,
  createNodeCommands,
  createNotificationCommands,
  createOrganizationCommands,
  createOverviewCommands,
  createProjectCommands,
  createScheduledJobCommands,
  createSessionCommands,
  createSettingsCommands,
  createTerminalCommands,
  createWorkbenchCommands,
  createWorkspaceCommands,
  type AgentCommandSurface,
  type AppCommandSurface,
  type Commands,
  type FileCommandSurface,
  type GitCommandSurface,
  type NodeCommandSurface,
  type NotificationCommandSurface,
  type OrganizationCommandSurface,
  type OverviewCommandSurface,
  type ProjectCommandSurface,
  type ScheduledJobCommandSurface,
  type SessionCommandSurface,
  type SettingsCommandSurface,
  type TerminalCommandSurface,
  type WorkbenchCommandSurface,
  type WorkspaceCommandSurface,
} from "../app/commands/composition";

/**
 * UI-facing command hooks (Phase 12, desktop5.md).
 *
 * `useCommands` returns the composed application surface (all features) and
 * remains the app-level entry. Feature-scoped consumers request the smallest
 * relevant surface via `useWorkspaceCommands` and friends instead of the
 * global object.
 */
export function useCommands(): Commands {
  return useMemo(() => createCommands(), []);
}

export function useAppCommands(): AppCommandSurface {
  return useMemo(() => createAppCommands(), []);
}

export function useSessionCommands(): SessionCommandSurface {
  return useMemo(() => createSessionCommands(), []);
}

export function useWorkspaceCommands(): WorkspaceCommandSurface {
  return useMemo(() => createWorkspaceCommands(), []);
}

export function useAgentCommands(): AgentCommandSurface {
  return useMemo(() => createAgentCommands(), []);
}

export function useGitCommands(): GitCommandSurface {
  return useMemo(() => createGitCommands(), []);
}

export function useNodeCommands(): NodeCommandSurface {
  return useMemo(() => createNodeCommands(), []);
}

export function useNotificationCommands(): NotificationCommandSurface {
  return useMemo(() => createNotificationCommands(), []);
}

export function useOrganizationCommands(): OrganizationCommandSurface {
  return useMemo(() => createOrganizationCommands(), []);
}

export function useOverviewCommands(): OverviewCommandSurface {
  return useMemo(() => createOverviewCommands(), []);
}

export function useScheduledJobCommands(): ScheduledJobCommandSurface {
  return useMemo(() => createScheduledJobCommands(), []);
}

export function useFileCommands(): FileCommandSurface {
  return useMemo(() => createFileCommands(), []);
}

export function useProjectCommands(): ProjectCommandSurface {
  return useMemo(() => createProjectCommands(), []);
}

export function useWorkbenchCommands(): WorkbenchCommandSurface {
  return useMemo(() => createWorkbenchCommands(), []);
}

export function useTerminalCommands(): TerminalCommandSurface {
  return useMemo(() => createTerminalCommands(), []);
}

export function useSettingsCommands(): SettingsCommandSurface {
  return useMemo(() => createSettingsCommands(), []);
}

export type {
  AgentCommandSurface,
  AppCommandSurface,
  Commands,
  FileCommandSurface,
  GitCommandSurface,
  NodeCommandSurface,
  NotificationCommandSurface,
  OrganizationCommandSurface,
  OverviewCommandSurface,
  ProjectCommandSurface,
  ScheduledJobCommandSurface,
  SessionCommandSurface,
  SettingsCommandSurface,
  TerminalCommandSurface,
  WorkbenchCommandSurface,
  WorkspaceCommandSurface,
} from "../app/commands/composition";
