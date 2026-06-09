import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  ModelBreakdownItem,
  OverviewTimeRange,
  TokenUsageSeriesItem,
  WorkspaceInsightsResult,
} from "../api/overviewApi.types";

type LoadState = "idle" | "loading" | "loaded" | "error";

type OverviewStoreState = {
  timeRange: OverviewTimeRange;
  selectedProjectId: string | undefined;
  granularity: "hour" | "day";

  tokenUsageSeries: TokenUsageSeriesItem[];
  cachedTotal: number;
  uncachedTotal: number;
  tokenUsageLoadState: LoadState;
  tokenUsageLoadError: string | null;

  modelBreakdown: ModelBreakdownItem[];
  modelBreakdownLoadState: LoadState;
  modelBreakdownLoadError: string | null;

  workspaceInsights: WorkspaceInsightsResult | null;
  workspaceInsightsLoadState: LoadState;
  workspaceInsightsLoadError: string | null;

  setTimeRange: (range: OverviewTimeRange) => void;
  setSelectedProjectId: (projectId: string | undefined) => void;
  setGranularity: (granularity: "hour" | "day") => void;

  setTokenUsageData: (series: TokenUsageSeriesItem[], cachedTotal: number, uncachedTotal: number) => void;
  setTokenUsageLoadState: (state: LoadState, error?: string | null) => void;

  setModelBreakdown: (models: ModelBreakdownItem[]) => void;
  setModelBreakdownLoadState: (state: LoadState, error?: string | null) => void;

  setWorkspaceInsights: (insights: WorkspaceInsightsResult) => void;
  setWorkspaceInsightsLoadState: (state: LoadState, error?: string | null) => void;
};

export const overviewStore = create<OverviewStoreState>()(
  immer((set) => ({
    timeRange: "7d",
    selectedProjectId: undefined,
    granularity: "day",

    tokenUsageSeries: [],
    cachedTotal: 0,
    uncachedTotal: 0,
    tokenUsageLoadState: "idle",
    tokenUsageLoadError: null,

    modelBreakdown: [],
    modelBreakdownLoadState: "idle",
    modelBreakdownLoadError: null,

    workspaceInsights: null,
    workspaceInsightsLoadState: "idle",
    workspaceInsightsLoadError: null,

    setTimeRange: (timeRange) => {
      set({ timeRange });
    },
    setSelectedProjectId: (selectedProjectId) => {
      set({ selectedProjectId });
    },
    setGranularity: (granularity) => {
      set({ granularity });
    },
    setTokenUsageData: (tokenUsageSeries, cachedTotal, uncachedTotal) => {
      set({ tokenUsageSeries, cachedTotal, uncachedTotal });
    },
    setTokenUsageLoadState: (tokenUsageLoadState, tokenUsageLoadError = null) => {
      set({ tokenUsageLoadState, tokenUsageLoadError });
    },
    setModelBreakdown: (modelBreakdown) => {
      set({ modelBreakdown });
    },
    setModelBreakdownLoadState: (modelBreakdownLoadState, modelBreakdownLoadError = null) => {
      set({ modelBreakdownLoadState, modelBreakdownLoadError });
    },
    setWorkspaceInsights: (workspaceInsights) => {
      set({ workspaceInsights });
    },
    setWorkspaceInsightsLoadState: (workspaceInsightsLoadState, workspaceInsightsLoadError = null) => {
      set({ workspaceInsightsLoadState, workspaceInsightsLoadError });
    },
  })),
);
