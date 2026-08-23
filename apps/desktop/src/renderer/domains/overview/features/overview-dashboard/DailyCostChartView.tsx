import { Box, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OverviewTimeRange } from "../../../../domains/overview/overviewTypes";
import { overviewStore } from "../../../../domains/overview/state/overviewStore";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(value: number | null): string {
  return usdFormatter.format(value ?? 0);
}

function formatUtcDate(utcDate: Date): string {
  return utcDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const RANGE_DAYS: Record<OverviewTimeRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function getUtcDateKey(utcDate: Date): string {
  return utcDate.toISOString().slice(0, 10);
}

function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let offset = days - 1; offset >= 0; offset--) {
    dates.push(getUtcDateKey(new Date(todayUtcMs - offset * 86_400_000)));
  }

  return dates;
}

export function DailyCostChartView() {
  const { t } = useTranslation();
  const series = overviewStore((state) => state.tokenUsageSeries);
  const loadState = overviewStore((state) => state.tokenUsageLoadState);
  const timeRange = overviewStore((state) => state.timeRange);
  const totalCostUsd = overviewStore((state) => state.totalCostUsd);

  const chartData = useMemo(() => {
    const costByDateKey = new Map<string, number>();
    for (const bucket of series) {
      const dateKey = getUtcDateKey(new Date(bucket.bucketStartUtc));
      costByDateKey.set(dateKey, (costByDateKey.get(dateKey) ?? 0) + bucket.totalCostUsd);
    }

    return generateDateRange(RANGE_DAYS[timeRange]).map((dateKey) => ({
      date: formatUtcDate(new Date(`${dateKey}T00:00:00.000Z`)),
      costUsd: costByDateKey.get(dateKey) ?? 0,
    }));
  }, [series, timeRange]);

  if (loadState === "loading" || loadState === "idle") {
    return (
      <Box sx={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("overview.dailyCost.loading")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        {t("overview.dailyCost.title")}
      </Typography>
      <Box sx={{ height: 240, width: "100%" }}>
        {series.length === 0 ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {t("overview.dailyCost.noData")}
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
              },
            ]}
            yAxis={[{ valueFormatter: formatUsd, tickLabelStyle: { fontSize: 11 } }]}
            series={[
              {
                type: "bar",
                dataKey: "costUsd",
                label: t("overview.dailyCost.cost"),
                valueFormatter: formatUsd,
              },
            ]}
            margin={{ top: 8, right: 8, bottom: 24, left: 60 }}
            height={240}
          />
        )}
      </Box>
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t("overview.dailyCost.total")}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
          {usdFormatter.format(totalCostUsd)}
        </Typography>
      </Box>
    </Box>
  );
}
