/**
 * Overview feature public API (Phase 12, desktop5.md).
 */
export type { OverviewCommands } from "./commands/contract";

export { OverviewView } from "./features/overview-dashboard/OverviewView";
export {
  loadAllOverviewData,
  setOverviewGranularity,
  setOverviewProjectId,
  setOverviewTimeRange,
} from "./commands/overviewCommands";
