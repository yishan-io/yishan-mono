// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overviewStore } from "../../../../domains/overview/state/overviewStore";
import { DailyCostChartView } from "./DailyCostChartView";

let chartDataset: unknown;
let chartXAxis: unknown;

vi.mock("@mui/x-charts/BarChart", () => ({
  BarChart: ({ dataset, xAxis }: { dataset: unknown; xAxis: unknown }) => {
    chartDataset = dataset;
    chartXAxis = xAxis;
    return null;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const initialOverviewState = overviewStore.getState();

function makeBucket(bucketStartUtc: string, totalCostUsd: number) {
  return {
    bucketStartUtc,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cachedWriteTokens: 0,
    turnCount: 0,
    toolCallCount: 0,
    totalCostUsd,
  };
}

describe("DailyCostChartView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
    chartDataset = undefined;
    chartXAxis = undefined;
    overviewStore.setState({
      tokenUsageLoadState: "loaded",
      tokenUsageSeries: [],
      totalCostUsd: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    overviewStore.setState(initialOverviewState, true);
  });

  it("aggregates costs by UTC day and includes the first partial day", () => {
    overviewStore.setState({
      tokenUsageSeries: [
        makeBucket("2026-08-21T23:00:00.000Z", 0.5),
        makeBucket("2026-08-22T01:00:00.000Z", 0.25),
        makeBucket("2026-08-22T23:00:00.000Z", 0.75),
      ],
      timeRange: "7d",
      totalCostUsd: 1.5,
    });

    render(<DailyCostChartView />);

    expect(screen.getByText("overview.dailyCost.title")).toBeTruthy();
    expect(screen.getByText("$1.50")).toBeTruthy();
    expect(chartDataset).toEqual([
      { date: "Aug 16", costUsd: 0 },
      { date: "Aug 17", costUsd: 0 },
      { date: "Aug 18", costUsd: 0 },
      { date: "Aug 19", costUsd: 0 },
      { date: "Aug 20", costUsd: 0 },
      { date: "Aug 21", costUsd: 0.5 },
      { date: "Aug 22", costUsd: 1 },
    ]);
    expect(chartXAxis).toEqual([expect.objectContaining({ scaleType: "band" })]);
  });

  it("shows an empty-state message when no daily costs are available", () => {
    render(<DailyCostChartView />);

    expect(screen.getByText("overview.dailyCost.noData")).toBeTruthy();
  });
});
