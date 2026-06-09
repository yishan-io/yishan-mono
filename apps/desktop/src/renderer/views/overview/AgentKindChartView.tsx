import { Box, Typography } from "@mui/material";
import { PieChart } from "@mui/x-charts/PieChart";
import { useMemo } from "react";
import { overviewStore } from "../../store/overviewStore";

const AGENT_KIND_COLORS: Record<string, string> = {
  opencode: "#6366F1",
  codex: "#22C55E",
  claude: "#F97316",
  gemini: "#3B82F6",
  pi: "#EC4899",
  copilot: "#14B8A6",
  cursor: "#A855F7",
};

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

export function AgentKindChartView() {
  const agentKinds = overviewStore((state) => state.agentKindBreakdown);
  const loadState = overviewStore((state) => state.agentKindBreakdownLoadState);
  const cachedTotal = overviewStore((state) => state.cachedTotal);
  const uncachedTotal = overviewStore((state) => state.uncachedTotal);

  const totalTokens = cachedTotal + uncachedTotal;

  const pieData = useMemo(
    () =>
      agentKinds
        .filter((item) => item.totalTokens > 0)
        .map((item) => ({
          id: item.agentKind,
          value: item.totalTokens,
          label: capitalize(item.agentKind),
          color: AGENT_KIND_COLORS[item.agentKind] ?? "#9CA3AF",
        })),
    [agentKinds],
  );

  if (loadState === "loading" || loadState === "idle") {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Agent Usage
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Agent Usage
      </Typography>

      {pieData.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No data available
        </Typography>
      ) : (
        <Box sx={{ height: 240, width: "100%" }}>
          <PieChart
            series={[
              {
                type: "pie",
                data: pieData,
                innerRadius: 60,
                outerRadius: 100,
                paddingAngle: 2,
                cornerRadius: 4,
                highlightScope: { fade: "global", highlight: "item" },
                valueFormatter: (_item: { value: number }) => formatTokens(_item.value),
              },
            ]}
            margin={{ top: 8, right: 100, bottom: 8, left: 8 }}
            height={240}
          />
        </Box>
      )}

      {totalTokens > 0 ? (
        <Box sx={{ display: "flex", gap: 3, mt: 1.5, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Total Tokens
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
              {formatTokens(totalTokens)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Agents
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
              {agentKinds.length}
            </Typography>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
