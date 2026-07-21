import { Box, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { COLOR_PRIMITIVES, type DesignTokenThemeMode } from "@yishan-io/design-tokens/v1";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { agentChatStore } from "../../../store/agentChatStore";
import type { AgentMessage } from "../../../store/agentChatTypes";
import { buildAgentChatUsageSummary, formatDetailedTokenCount } from "../../../views/workspace/agentChatUsageSummary";

const EMPTY_MESSAGES: AgentMessage[] = [];
const USAGE_SUMMARY_FONT_SIZE_PX = 12;
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type AgentChatUsageSummaryLabelProps = {
  tabId: string;
};

/** Returns the inline summary color based on context utilization percentage. */
export function getUsageSummaryColor(contextPercent: number, themeMode: DesignTokenThemeMode = "dark"): string {
  if (contextPercent > 90) {
    return "error.dark";
  }

  if (contextPercent > 70) {
    return themeMode === "light" ? COLOR_PRIMITIVES.brand.amber700 : COLOR_PRIMITIVES.brand.amber300;
  }

  return "text.disabled";
}

/** Renders the live agent-chat context/cost summary without rerendering sibling controls. */
export function AgentChatUsageSummaryLabel({ tabId }: AgentChatUsageSummaryLabelProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const currentModel = agentChatStore((state) => state.sessionsByTabId[tabId]?.currentModel ?? null);
  const messages = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages ?? EMPTY_MESSAGES);
  const streamingMessage = agentChatStore((state) => state.sessionsByTabId[tabId]?.streamingMessage ?? null);
  const usageSummary = useMemo(() => {
    const messagesForUsage = streamingMessage ? [...messages, streamingMessage] : messages;
    return buildAgentChatUsageSummary(messagesForUsage, currentModel);
  }, [currentModel, messages, streamingMessage]);

  if (!usageSummary) {
    return null;
  }

  const costSeparatorIndex = usageSummary.label.lastIndexOf(", ");
  const contextSummaryLabel =
    costSeparatorIndex >= 0 ? usageSummary.label.slice(0, costSeparatorIndex) : usageSummary.label;
  const costSummaryLabel = costSeparatorIndex >= 0 ? usageSummary.label.slice(costSeparatorIndex + 2) : null;
  const contextCompactLabel = t("agentChat.usageSummary.contextCompact");
  const compactUsageLabel = `${contextCompactLabel}: ${contextSummaryLabel.slice(4)}${
    costSummaryLabel ? `, ${costSummaryLabel}` : ""
  }`;

  const tooltipContent = (
    <Box sx={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 2, rowGap: 0.5 }}>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.currentContext")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {`${formatDetailedTokenCount(usageSummary.contextTokens)} / ${formatDetailedTokenCount(usageSummary.contextWindow)} (${usageSummary.contextPercent}%)`}
      </Typography>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.input")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {formatDetailedTokenCount(usageSummary.inputTokens)}
      </Typography>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.output")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {formatDetailedTokenCount(usageSummary.outputTokens)}
      </Typography>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.cacheRead")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {formatDetailedTokenCount(usageSummary.cacheReadTokens)}
      </Typography>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.cacheWrite")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {formatDetailedTokenCount(usageSummary.cacheWriteTokens)}
      </Typography>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.cacheRate")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {`${usageSummary.cacheRatePercent}%`}
      </Typography>
      {usageSummary.reasoningTokens > 0 ? (
        <>
          <Typography variant="caption" color="inherit">
            {t("agentChat.usageSummary.reasoning")}
          </Typography>
          <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
            {formatDetailedTokenCount(usageSummary.reasoningTokens)}
          </Typography>
        </>
      ) : null}
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.sessionTotalCumulative")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {formatDetailedTokenCount(usageSummary.totalSessionTokens)}
      </Typography>
      <Typography variant="caption" color="inherit">
        {t("agentChat.usageSummary.cost")}
      </Typography>
      <Typography variant="caption" color="inherit" sx={{ textAlign: "right" }}>
        {usdFormatter.format(usageSummary.totalCostUsd)}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Box
        component="span"
        aria-label={compactUsageLabel}
        sx={{
          fontSize: USAGE_SUMMARY_FONT_SIZE_PX,
          lineHeight: 1.5,
          whiteSpace: "nowrap",
          cursor: "help",
        }}
      >
        <Box component="span" sx={{ color: "text.disabled" }}>
          {contextCompactLabel}:
        </Box>
        <Box component="span" sx={{ color: getUsageSummaryColor(usageSummary.contextPercent, theme.palette.mode) }}>
          {` ${contextSummaryLabel.slice(4)}`}
        </Box>
        {costSummaryLabel ? (
          <Box component="span" sx={{ color: "text.disabled" }}>
            {`, ${costSummaryLabel}`}
          </Box>
        ) : null}
      </Box>
    </Tooltip>
  );
}
