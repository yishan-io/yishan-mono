// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overviewStore } from "../../store/overviewStore";
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
      cachedTotal: 0,
      cachedWriteTotal: 0,
      uncachedTotal: 0,
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

  it("total equals sum of visible bar data — all buckets within range", () => {
    // Two buckets both within the 7-day UTC window
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 500, 200), makeBucket(utcDateIso(3), 300, 100)],
      cachedTotal: 300, // API aggregate — intentionally same as chart sum here
      uncachedTotal: 500,
    });

    render(<TokenUsageChartView />);

    // chartCachedTotal = 200+100 = 300 (K unit)
    // chartUncachedTotal = 300+200 = 500 (K unit)
    // chartTotalTokens = 800 (K unit) → "0.80K"
    // statUnit = "K" because total=800 >= 1000? No, 800 < 1000 → "raw"
    // total=800 → "800", cached=300 → "300", uncached=500 → "500"
    expect(screen.getByText("800")).toBeTruthy();
    expect(screen.getByText(/300.*37\.5%/)).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
  });

  it("stat numbers use a consistent unit derived from the total", () => {
    // Total will be 1,500,000 → statUnit = "M"
    // cached=1,000,000, uncached=500,000
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 1_500_000, 1_000_000)],
      cachedTotal: 1_000_000,
      uncachedTotal: 500_000,
    });

    render(<TokenUsageChartView />);

    // All three should use M with 2 decimal places
    expect(screen.getByText("1.50M")).toBeTruthy();
    expect(screen.getByText(/1\.00M.*66\.7%/)).toBeTruthy();
    expect(screen.getByText("0.50M")).toBeTruthy();
  });

  it("stat numbers use B when the visible total is in the billions", () => {
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(1), 3_750_000_000, 2_500_000_000)],
      cachedTotal: 2_500_000_000,
      uncachedTotal: 1_250_000_000,
    });

    render(<TokenUsageChartView />);

    expect(screen.getByText("3.75B")).toBeTruthy();
    expect(screen.getByText(/2\.50B.*66\.7%/)).toBeTruthy();
    expect(screen.getByText("1.25B")).toBeTruthy();
  });

  it("total reflects only visible bars when a bucket falls outside the date range", () => {
    // Bucket from 10 days ago UTC — outside the 7d window, will be dropped from chartData
    const droppedBucket = makeBucket(utcDateIso(10), 1000, 400);
    // Bucket from yesterday UTC — inside the 7d window
    const visibleBucket = makeBucket(utcDateIso(1), 600, 200);

    overviewStore.setState({
      tokenUsageSeries: [droppedBucket, visibleBucket],
      // API aggregate includes both buckets (simulates the timezone-drop bug)
      cachedTotal: 600,
      uncachedTotal: 1000,
    });

    render(<TokenUsageChartView />);

    // Only the visible bucket contributes to the chart
    // chartCachedTotal = 200, chartUncachedTotal = 400, chartTotalTokens = 600
    expect(screen.getByText("600")).toBeTruthy();
    // Should NOT show 1600 (what cachedTotal+uncachedTotal from the API would give)
    expect(screen.queryByText("1600")).toBeNull();
  });

  it("cached percentage is computed from chart totals, not API totals", () => {
    overviewStore.setState({
      tokenUsageSeries: [makeBucket(utcDateIso(2), 400, 100)],
      // API returns different totals (simulates mismatch)
      cachedTotal: 300,
      uncachedTotal: 700,
    });

    render(<TokenUsageChartView />);

    // chartCachedTotal=100, chartTotalTokens=400 → 25.0%
    expect(screen.getByText(/100.*25\.0%/)).toBeTruthy();
    // Should NOT show the API-based percentage (30%)
    expect(screen.queryByText(/300.*30\.0%/)).toBeNull();
  });
});
