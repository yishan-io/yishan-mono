/**
 * OverviewCommands — the public command surface for the Overview feature.
 *
 * Phase 8 contract. Owned by `features/overview/commands/overviewCommands.ts`;
 * conformance enforces the surface at typecheck time.
 */
import type * as overviewCommands from "./overviewCommands";

export type OverviewCommands = {
  refreshOverviewTokenUsage: typeof overviewCommands.refreshOverviewTokenUsage;
  refreshOverviewModelBreakdown: typeof overviewCommands.refreshOverviewModelBreakdown;
  refreshOverviewAgentKindBreakdown: typeof overviewCommands.refreshOverviewAgentKindBreakdown;
  refreshOverviewWorkspaceInsights: typeof overviewCommands.refreshOverviewWorkspaceInsights;
  loadAllOverviewData: typeof overviewCommands.loadAllOverviewData;
  setOverviewTimeRange: typeof overviewCommands.setOverviewTimeRange;
  setOverviewProjectId: typeof overviewCommands.setOverviewProjectId;
  setOverviewGranularity: typeof overviewCommands.setOverviewGranularity;
};
