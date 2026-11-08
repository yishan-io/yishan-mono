import { Box, Typography } from "@mui/material";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { AgentChatUsageSummary } from "../../../chat/agentChatUsageSummary";
import { AgentChatTokenCompositionBar } from "./AgentChatTokenCompositionBar";
import { formatDetailedTokenCount } from "./agentChatUsageFormatting";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type AgentChatUsageDetailsProps = {
  summary: AgentChatUsageSummary;
  contextLabel: string;
};

/** Displays context and cumulative billed usage without altering their accounting. */
export function AgentChatUsageDetails({ summary, contextLabel }: AgentChatUsageDetailsProps) {
  const { t } = useTranslation();
  const rows = [
    ["currentContext", contextLabel],
    ["cacheRate", `${summary.cacheRatePercent}%`],
    ...(summary.reasoningTokens > 0 ? [["reasoning", formatDetailedTokenCount(summary.reasoningTokens)]] : []),
    ["cost", usdFormatter.format(summary.totalCostUsd)],
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 2, rowGap: 0.5 }}>
      {rows.map(([key, value]) => (
        <Fragment key={key}>
          <Typography variant="caption" sx={{ color: "inherit" }}>
            {t(`agentChat.usageSummary.${key}`)}
          </Typography>
          <Typography variant="caption" sx={{ color: "inherit", textAlign: "right" }}>
            {value}
          </Typography>
        </Fragment>
      ))}
      <AgentChatTokenCompositionBar summary={summary} />
    </Box>
  );
}
