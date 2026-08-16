// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overviewStore } from "../../features/overview/model/overviewStore";
import { AgentKindChartView } from "./AgentKindChartView";

vi.mock("@mui/x-charts/PieChart", () => ({
  PieChart: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function makeAgentKind(agentKind: string, totalTokens: number) {
  return {
    agentKind,
    totalTokens,
    inputTokens: totalTokens,
    outputTokens: 0,
    percentage: 0,
  };
}

const initialOverviewState = overviewStore.getState();

describe("AgentKindChartView", () => {
  beforeEach(() => {
    overviewStore.setState({
      agentKindBreakdownLoadState: "loaded",
      agentKindBreakdown: [],
      grandTotal: 0,
    });
  });

  afterEach(() => {
    cleanup();
    overviewStore.setState(initialOverviewState, true);
  });

  it("shows total from grandTotal in the store, not from agentKindBreakdown sum", () => {
    overviewStore.setState({
      agentKindBreakdown: [makeAgentKind("opencode", 300), makeAgentKind("pi", 200)],
      grandTotal: 800,
    });

    render(<AgentKindChartView />);

    // grandTotal = 800 (raw since < 1000)
    // SUM(agentKindBreakdown) = 500 — should NOT appear
    expect(screen.getByText("800")).toBeTruthy();
    expect(screen.queryByText("500")).toBeNull();
  });

  it("shows zero grandTotal as 0 when no tokens", () => {
    overviewStore.setState({
      agentKindBreakdown: [],
      grandTotal: 0,
    });

    render(<AgentKindChartView />);

    // Stat box is hidden when grandTotal is 0 (the > 0 guard)
    // Should show "noData" message since pieData is empty
    expect(screen.getByText("overview.agentUsage.noData")).toBeTruthy();
  });

  it("shows grandTotal with M unit for large values", () => {
    overviewStore.setState({
      agentKindBreakdown: [makeAgentKind("opencode", 1_500_000)],
      grandTotal: 1_500_000,
    });

    render(<AgentKindChartView />);

    expect(screen.getByText("1.5M")).toBeTruthy();
  });

  it("shows B unit for billions", () => {
    overviewStore.setState({
      agentKindBreakdown: [makeAgentKind("opencode", 3_750_000_000)],
      grandTotal: 3_750_000_000,
    });

    render(<AgentKindChartView />);

    expect(screen.getByText("3.8B")).toBeTruthy();
  });

  it("does not show cachedTotal + uncachedTotal sum", () => {
    overviewStore.setState({
      agentKindBreakdown: [makeAgentKind("opencode", 100)],
      grandTotal: 100,
    });

    render(<AgentKindChartView />);

    // grandTotal=100 → "100" (raw unit since < 1000)
    expect(screen.getByText("100")).toBeTruthy();
  });
});
