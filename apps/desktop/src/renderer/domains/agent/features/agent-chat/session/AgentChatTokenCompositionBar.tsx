import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { AgentChatUsageSummary } from "../../../chat/agentChatUsageSummary";
import { formatDetailedTokenCount } from "./agentChatUsageFormatting";

const TOKEN_CATEGORIES = [
  { key: "input", field: "inputTokens", color: "primary.main" },
  { key: "output", field: "outputTokens", color: "secondary.main" },
  { key: "cacheRead", field: "cacheReadTokens", color: "success.main" },
  { key: "cacheWrite", field: "cacheWriteTokens", color: "warning.main" },
] as const;

const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type AgentChatTokenCompositionBarProps = {
  summary: AgentChatUsageSummary;
};

/** Shows cumulative billed token proportions, not current context occupancy. */
export function AgentChatTokenCompositionBar({ summary }: AgentChatTokenCompositionBarProps) {
  const { t } = useTranslation();
  const cumulativeLabel = t("agentChat.usageSummary.sessionTotalCumulative");
  const categories = TOKEN_CATEGORIES.map((category) => ({
    ...category,
    label: t(`agentChat.usageSummary.${category.key}`),
    count: formatDetailedTokenCount(summary[category.field]),
    percent: summary.totalSessionTokens > 0 ? (summary[category.field] / summary.totalSessionTokens) * 100 : 0,
  }));

  return (
    <Box sx={{ gridColumn: "1 / -1", mt: 0.75 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
        <Typography variant="caption" sx={{ color: "inherit" }}>
          {cumulativeLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: "inherit" }}>
          {formatDetailedTokenCount(summary.totalSessionTokens)}
        </Typography>
      </Box>
      <Box
        role="img"
        aria-label={cumulativeLabel}
        sx={{ display: "flex", height: 4, borderRadius: 1, overflow: "hidden", bgcolor: "divider", my: 0.75 }}
      >
        {categories.map(({ key, label, percent, color }) => (
          <Box key={key} aria-label={label} style={{ width: `${percent}%` }} sx={{ bgcolor: color }} />
        ))}
      </Box>
      <Box sx={{ display: "grid", gap: 0.5 }}>
        {categories.map(({ key, label, count, percent, color }) => (
          <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box
              data-testid="token-legend-swatch"
              aria-hidden
              sx={{ width: 6, height: 6, borderRadius: 0.5, bgcolor: color, flexShrink: 0 }}
            />
            <Typography variant="caption" sx={{ color: "inherit", flex: 1 }}>
              {label}
            </Typography>
            <Typography variant="caption" sx={{ color: "inherit" }}>
              {`${count} (${percentFormatter.format(percent)}%)`}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
