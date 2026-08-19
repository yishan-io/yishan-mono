import { useMemo } from "react";
import {
  type AgentCommandSurface,
  type AppCommandSurface,
  type Commands,
  type FileCommandSurface,
  type GitCommandSurface,
  type TerminalCommandSurface,
  type WorkbenchCommandSurface,
  type WorkspaceCommandSurface,
  createAgentCommands,
  createAppCommands,
  createCommands,
  createFileCommands,
  createGitCommands,
  createTerminalCommands,
  createWorkbenchCommands,
  createWorkspaceCommands,
} from "./composition";

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

export function useWorkspaceCommands(): WorkspaceCommandSurface {
  return useMemo(() => createWorkspaceCommands(), []);
}

export function useAgentCommands(): AgentCommandSurface {
  return useMemo(() => createAgentCommands(), []);
}

export function useGitCommands(): GitCommandSurface {
  return useMemo(() => createGitCommands(), []);
}

export function useFileCommands(): FileCommandSurface {
  return useMemo(() => createFileCommands(), []);
}

export function useWorkbenchCommands(): WorkbenchCommandSurface {
  return useMemo(() => createWorkbenchCommands(), []);
}

export function useTerminalCommands(): TerminalCommandSurface {
  return useMemo(() => createTerminalCommands(), []);
}

export type {
  AgentCommandSurface,
  AppCommandSurface,
  Commands,
  FileCommandSurface,
  GitCommandSurface,
  TerminalCommandSurface,
  WorkbenchCommandSurface,
  WorkspaceCommandSurface,
} from "./composition";
