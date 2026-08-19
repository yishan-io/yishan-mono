import { useMemo } from "react";
import {
  type AgentCommandSurface,
  type AppCommandSurface,
  type GitCommandSurface,
  type WorkbenchCommandSurface,
  type WorkspaceCommandSurface,
  createAgentCommands,
  createAppCommands,
  createGitCommands,
  createWorkbenchCommands,
  createWorkspaceCommands,
} from "./composition";

/**
 * UI-facing command hooks (Phase 12, desktop5.md).
 *
 * The composed `useCommands` surface was removed in Desktop 11 Phase 46;
 * the shortcut runtime now uses a narrow action registry
 * (`shortcuts/types.ts`). Consumers import the remaining surfaces only.
 */
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

export function useWorkbenchCommands(): WorkbenchCommandSurface {
  return useMemo(() => createWorkbenchCommands(), []);
}

export type {
  AgentCommandSurface,
  AppCommandSurface,
  GitCommandSurface,
  WorkbenchCommandSurface,
  WorkspaceCommandSurface,
} from "./composition";
