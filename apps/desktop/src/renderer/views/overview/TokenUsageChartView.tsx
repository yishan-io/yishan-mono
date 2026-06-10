import { Box, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { useMemo } from "react";
import type { OverviewTimeRange } from "../../api/overviewApi.types";
import { overviewStore } from "../../store/overviewStore";

function formatTokens(value: number | null): string {
  if (value == null) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseBucketDate(dateStr: string): string {
  return formatDate(new Date(dateStr));
}

const RANGE_DAYS: Record<OverviewTimeRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function TokenUsageChartView() {
  const series = overviewStore((state) => state.tokenUsageSeries);
  const cachedTotal = overviewStore((state) => state.cachedTotal);
  const uncachedTotal = overviewStore((state) => state.uncachedTotal);
  const loadState = overviewStore((state) => state.tokenUsageLoadState);
  const timeRange = overviewStore((state) => state.timeRange);

  const chartData = useMemo(() => {
    const dataByDate = new Map<string, { cachedTokens: number; uncachedTokens: number }>();
    for (const item of series) {
      const date = parseBucketDate(item.bucketStartUtc);
      const cached = item.cachedInputTokens;
      const uncached = Math.max(0, item.totalTokens - item.cachedInputTokens);
      dataByDate.set(date, { cachedTokens: cached, uncachedTokens: uncached });
    }

    const days = RANGE_DAYS[timeRange];
    const allDates = generateDateRange(days);

    return allDates.map((date) => {
      const entry = dataByDate.get(date);
      return {
        date,
        cachedTokens: entry?.cachedTokens ?? 0,
        uncachedTokens: entry?.uncachedTokens ?? 0,
      };
    });
  }, [series, timeRange]);

  const totalTokens = cachedTotal + uncachedTotal;
  const cachedPercentage = totalTokens > 0 ? ((cachedTotal / totalTokens) * 100).toFixed(1) : "0";

  if (loadState === "loading" || loadState === "idle") {
    return (
      <Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Loading chart...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Token Usage
      </Typography>

      <Box sx={{ height: 240, width: "100%" }}>
        {chartData.length === 0 ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No token usage data available
            </Typography>
          </Box>
        ) : (
          <BarChart
            dataset={chartData}
            xAxis={[
              {
                dataKey: "date",
                scaleType: "band",
                tickLabelStyle: { fontSize: 11 },
                tickLabelInterval: (_value: unknown, index: number) => {
                  const days = RANGE_DAYS[timeRange];
                  const step = days <= 7 ? 1 : days <= 30 ? 5 : 10;
                  return index % step === 0;
                },
              },
            ]}
            yAxis={[
              {
                valueFormatter: formatTokens,
                tickLabelStyle: { fontSize: 11 },
              },
            ]}
            series={[
              {
                type: "bar",
                dataKey: "cachedTokens",
                stack: "total",
                label: "Cached",
                color: "#4CAF50",
                valueFormatter: formatTokens,
              },
              {
                type: "bar",
                dataKey: "uncachedTokens",
                stack: "total",
                label: "Uncached",
                color: "#FF9800",
                valueFormatter: formatTokens,
              },
            ]}
            slotProps={{
              legend: {
                position: { vertical: "top", horizontal: "end" },
              },
            }}
            margin={{ top: 8, right: 8, bottom: 24, left: 50 }}
            height={240}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 3, mt: 1.5, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Total
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
            {formatTokens(totalTokens)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Cached
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace", color: "#4CAF50" }}>
            {formatTokens(cachedTotal)} ({cachedPercentage}%)
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Uncached
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace", color: "#FF9800" }}>
            {formatTokens(uncachedTotal)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
