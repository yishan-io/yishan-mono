/**
 * Workbench Model types — TEMPORARY tab-type alias (desktop6-adjust.md W1
 * task 9). Tab type definitions moved to `./tabTypes` (W1 task 8); this file
 * re-exports them for one wave while callers move to the Workbench root API.
 *
 * Removed in this wave (W1):
 *   - Workspace Store types (moved to features/workspace/state/workspaceStoreTypes.ts)
 *   - Project Store re-exports (import from features/project/model/projectTypes)
 *   - Workspace type re-exports (import from features/workspace/model/workspaceTypes)
 *   - API and RPC client types (no transport imports in Workbench Model)
 *   - Agent chat type re-exports (import from features/agent/model/chatTypes)
 *
 * Removal wave: W6 (WorkbenchTab → WorkbenchTab rename; callers import tab
 * types from the Workbench root API).
 */
export type {
  AgentChatSessionView,
  DiffFileChangeKind,
  DiffTabSource,
  FileDiffEntry,
  OpenTabInput,
  WorkbenchTab,
  WorkbenchTabBase,
  WorkbenchTabDataByKind,
} from "./tabTypes";
