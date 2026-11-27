import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  selectedOrganizationId: "" as string | undefined,
  projects: [] as { id: string; name: string }[],
}));

vi.mock("../daemon/overviewDaemonProcedures", () => ({
  getOverviewTokenUsage: vi.fn(),
  getOverviewModelBreakdown: vi.fn(),
  getOverviewWorkspaceInsights: vi.fn(),
}));
vi.mock("@renderer/domains/session", () => ({
  sessionStore: { getState: () => ({ selectedOrganizationId: mocked.selectedOrganizationId }) },
}));
vi.mock("@renderer/domains/project", () => ({
  projectStore: { getState: () => ({ projects: mocked.projects }) },
}));

import * as procedures from "../daemon/overviewDaemonProcedures";
import { overviewStore } from "../state/overviewStore";
import {
  loadAllOverviewData,
  refreshOverviewTokenUsage,
  refreshOverviewWorkspaceInsights,
  setOverviewGranularity,
} from "./overviewCommands";

const daemon = {
  getTokenUsage: vi.mocked(procedures.getOverviewTokenUsage),
  getModelBreakdown: vi.mocked(procedures.getOverviewModelBreakdown),
  getWorkspaceInsights: vi.mocked(procedures.getOverviewWorkspaceInsights),
};

const tokenUsage = {
  series: [],
  cachedTotal: 2,
  cachedWriteTotal: 1,
  uncachedTotal: 7,
  grandTotal: 10,
  turnTotal: 3,
  toolCallTotal: 4,
  totalCostUsd: 1.25,
};

const workspaceItem = { branch: null, createdAt: "2026-11-19T00:00:00Z", totalTokens: 1, totalCostUsd: 0 };
const insights = {
  closedWorkspaceCount: 1,
  averageLifetimeHours: 2,
  lastClosedWorkspaces: [
    {
      ...workspaceItem,
      id: "c1",
      projectId: "p1",
      projectName: "p1",
      closedAt: "2026-11-20T00:00:00Z",
      lifetimeHours: 2,
    },
  ],
  primaryWorkspaceCount: 1,
  primaryWorkspaceTokens: 1,
  topPrimaryWorkspaces: [{ ...workspaceItem, id: "w1", projectId: "gone", projectName: "gone" }],
};

describe("overviewCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.selectedOrganizationId = undefined;
    mocked.projects = [];
    overviewStore.setState({ timeRange: "7d", selectedProjectId: undefined, granularity: "day" });
    daemon.getTokenUsage.mockResolvedValue(tokenUsage);
    daemon.getModelBreakdown.mockResolvedValue({ models: [] });
    daemon.getWorkspaceInsights.mockResolvedValue(insights);
  });

  it("loads from the daemon without a selected organization", async () => {
    await loadAllOverviewData();

    expect(daemon.getTokenUsage).toHaveBeenCalledWith({
      range: "7d",
      projectId: undefined,
      organizationId: undefined,
      granularity: "day",
    });
    const state = overviewStore.getState();
    expect(state.tokenUsageLoadState).toBe("loaded");
    expect(state.modelBreakdownLoadState).toBe("loaded");
    expect(state.workspaceInsightsLoadState).toBe("loaded");
    expect(state.grandTotal).toBe(10);
    expect(state.totalCostUsd).toBe(1.25);
  });

  it("forwards range, project, organization, and granularity", async () => {
    mocked.selectedOrganizationId = " org-1 ";
    overviewStore.setState({ timeRange: "90d", selectedProjectId: "p1" });

    setOverviewGranularity("hour");
    await vi.waitFor(() => expect(daemon.getTokenUsage).toHaveBeenCalled());

    expect(daemon.getTokenUsage).toHaveBeenCalledWith({
      range: "90d",
      projectId: "p1",
      organizationId: "org-1",
      granularity: "hour",
    });
    expect(daemon.getModelBreakdown).not.toHaveBeenCalled();
  });

  it("resolves project names from the project list and keeps the id fallback", async () => {
    mocked.projects = [{ id: "p1", name: "Project One" }];

    await refreshOverviewWorkspaceInsights();

    const result = overviewStore.getState().workspaceInsights;
    expect(result?.lastClosedWorkspaces[0]?.projectName).toBe("Project One");
    expect(result?.topPrimaryWorkspaces[0]?.projectName).toBe("gone");
  });

  it("records daemon failures as load errors", async () => {
    daemon.getTokenUsage.mockRejectedValue(new Error("daemon websocket closed"));

    await refreshOverviewTokenUsage();

    expect(overviewStore.getState().tokenUsageLoadState).toBe("error");
    expect(overviewStore.getState().tokenUsageLoadError).toBe("daemon websocket closed");
  });
});
