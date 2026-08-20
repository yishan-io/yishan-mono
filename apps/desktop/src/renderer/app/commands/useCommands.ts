import { useMemo } from "react";
import {
  type AppCommandSurface,
  type WorkbenchCommandSurface,
  createAppCommands,
  createWorkbenchCommands,
} from "./composition";

/**
 * UI-facing command hooks (Phase 12, desktop5.md).
 *
 * The composed `useCommands` surface was removed in Desktop 11 Phase 46;
 * the shortcut runtime now uses a narrow action registry
 * (`shortcuts/types.ts`). The Workbench surface is the last remaining
 * facade group (Workbench-owned compositions).
 */
export function useAppCommands(): AppCommandSurface {
  return useMemo(() => createAppCommands(), []);
}

export function useWorkbenchCommands(): WorkbenchCommandSurface {
  return useMemo(() => createWorkbenchCommands(), []);
}

export type {
  AppCommandSurface,
  WorkbenchCommandSurface,
} from "./composition";
