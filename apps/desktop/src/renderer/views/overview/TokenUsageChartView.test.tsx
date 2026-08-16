// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overviewStore } from "../../features/overview/model/overviewStore";
import { TokenUsageChartView } from "./TokenUsageChartView";

vi.mock("@mui/x-charts/BarChart", () => ({
  BarChart: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const initialOverviewState = overviewStore.getState();

function makeBucket(bucketStartUtc: string, totalTokens: number, cachedInputTokens: number) {
  return {
    bucketStartUtc,
    totalTokens,
    inputTokens: totalTokens - cachedInputTokens,
    outputTokens: 0,
    cachedInputTokens,
    cachedWriteTokens: 0,
    turnCount: 0,
    toolCallCount: 0,
    totalCostUsd: 0,
  };
}

/** Returns an ISO string for a UTC calendar day that is `daysAgo` days before today UTC. */
function utcDateIso(daysAgo: number): string {
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - daysAgo * 86_400_000;
  // Use UTC noon so the timestamp is unambiguously within that UTC calendar day
  return new Date(ms + 12 * 3600 * 1000).toISOString();
}

describe("TokenUsageChartView", () => {
  beforeEach(() => {
    overviewStore.setState({
      tokenUsageLoadState: "loaded",
      timeRange: "7d",
      tokenUsageSeries: [],
      grandTotal: 0,
      cachedTotal: 0,
      uncachedTotal: 0,
      turnTotal: 0,
      toolCallTotal: 0,
      totalCostUsd: 0,
    });
  });

  afterEach(() => {
    cleanup();
    overviewStore.setState(initialOverviewState, true);
  });

  it("shows zero totals when series is empty", () => {
    render(<TokenUsageChartView />);

    // Three stat boxes all display "0" — total, cached, uncached
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });

  it("stat boxes show server-provided cachedTotal and uncachedTotal alongside grandTotal", () => {
    // Two buckets both within the 7-day UTC window
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 500, 200), makeBucket(utcDateIso(3), 300, 100)],
      grandTotal: 800,
      cachedTotal: 300,
      uncachedTotal: 500,
      turnTotal: 7,
      toolCallTotal: 11,
    });

    render(<TokenUsageChartView />);

    // statUnit = "raw" because total=800 < 1000
    // total=800, cached=300, uncached=500 — all from server, arithmetically consistent
    expect(screen.getByText("800")).toBeTruthy();
    expect(screen.getByText(/300.*37\.5%/)).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
  });

  it("stat numbers use a consistent unit derived from the total", () => {
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 1_500_000, 1_000_000)],
      grandTotal: 1_500_000,
      cachedTotal: 1_000_000,
      uncachedTotal: 500_000,
    });

    render(<TokenUsageChartView />);

    // All three should use M with 2 decimal places
    expect(screen.getByText("1.50M")).toBeTruthy();
    expect(screen.getByText(/1\.00M.*66\.7%/)).toBeTruthy();
    expect(screen.getByText("0.50M")).toBeTruthy();
  });

  it("stat numbers use B when the total is in the billions", () => {
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 3_750_000_000, 2_500_000_000)],
      grandTotal: 3_750_000_000,
      cachedTotal: 2_500_000_000,
      uncachedTotal: 1_250_000_000,
    });

    render(<TokenUsageChartView />);

    expect(screen.getByText("3.75B")).toBeTruthy();
    expect(screen.getByText(/2\.50B.*66\.7%/)).toBeTruthy();
    expect(screen.getByText("1.25B")).toBeTruthy();
  });

  it("stat boxes use server totals, keeping cached+uncached=grandTotal even with dropped bar data", () => {
    // Bucket from 10 days ago UTC — outside the 7d bar window, dropped from chartData
    const droppedBucket = makeBucket(utcDateIso(10), 1000, 400);
    // Bucket from yesterday UTC — inside the 7d window
    const visibleBucket = makeBucket(utcDateIso(1), 600, 200);

    overviewStore.setState({
      tokenUsageSeries: [droppedBucket, visibleBucket],
      // Server-provided totals include both buckets
      grandTotal: 1600,
      cachedTotal: 600,
      uncachedTotal: 1000,
    });

    render(<TokenUsageChartView />);

    // All three stat boxes use server values: 1600 → 1.60K, 600 → 0.60K, 1000 → 1.00K
    // cached+uncached = 0.60K + 1.00K = 1.60K = grandTotal ✓
    expect(screen.getByText("1.60K")).toBeTruthy();
    expect(screen.getByText(/0\.60K.*37\.5%/)).toBeTruthy();
    expect(screen.getByText("1.00K")).toBeTruthy();
    // Should NOT show 0.20K / 0.40K (the old chart-derived values)
    expect(screen.queryByText("0.20K")).toBeNull();
    expect(screen.queryByText("0.40K")).toBeNull();
  });

  it("shows total cost from the server", () => {
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 500, 200)],
      grandTotal: 500,
      cachedTotal: 200,
      uncachedTotal: 300,
      totalCostUsd: 1.25,
    });

    render(<TokenUsageChartView />);

    expect(screen.getByText("$1.25")).toBeTruthy();
  });

  it("cached percentage is computed from server totals", () => {
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(2), 400, 100)],
      grandTotal: 400,
      cachedTotal: 100,
      uncachedTotal: 300,
    });

    render(<TokenUsageChartView />);

    // cachedTotal=100, grandTotal=400 → 100/400 = 25.0%
    expect(screen.getByText(/100.*25\.0%/)).toBeTruthy();
  });
});
