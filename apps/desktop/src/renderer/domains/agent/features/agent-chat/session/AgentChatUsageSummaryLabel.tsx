import { Box, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { COLOR_PRIMITIVES, type DesignTokenThemeMode } from "@yishan-io/design-tokens/v1";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgentMessage } from "../../../../../domains/agent/model/agentChatTypes";
import {
  buildAgentChatUsageSummary,
  roundContextPercent,
} from "../../../../../domains/agent/model/agentChatUsageSummary";
import { agentChatStore } from "../../../../../domains/agent/state/agentChatStore";
import { formatDetailedTokenCount } from "./agentChatUsageFormatting";

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
  const sessionStats = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionStats ?? null);
  // sessionStats is nulled at turn start (invalidateAgentSessionStats), so during a turn
  // the ?? fallbacks below surface the live estimate built from messages + streamingMessage.
  // Once the turn settles, agent_settled refreshes the authoritative snapshot again.
  const usageSummary = useMemo(() => {
    const messagesForUsage = streamingMessage ? [...messages, streamingMessage] : messages;
    return buildAgentChatUsageSummary(messagesForUsage, currentModel);
  }, [currentModel, messages, streamingMessage]);

  if (!usageSummary) {
    return null;
  }

  const contextUsage = sessionStats?.contextUsage;
  const contextTokens = contextUsage?.tokens ?? usageSummary.contextTokens;
  const contextWindow = contextUsage?.contextWindow ?? usageSummary.contextWindow;
  const contextPercent = roundContextPercent(contextUsage?.percent ?? usageSummary.contextPercent);
  const contextSummaryLabel =
    contextUsage?.tokens === null
      ? `ctx: ?/${formatDetailedTokenCount(contextWindow)} (?)`
      : `ctx: ${formatDetailedTokenCount(contextTokens)}/${formatDetailedTokenCount(contextWindow)} (${contextPercent}%)`;
  const totalSessionTokens = sessionStats?.tokens.total ?? usageSummary.totalSessionTokens;
  const totalCostUsd = sessionStats?.cost ?? usageSummary.totalCostUsd;
  const contextCompactLabel = t("agentChat.usageSummary.contextCompact");
  const compactUsageLabel = `${contextCompactLabel}: ${contextSummaryLabel.slice(4)}, ${usdFormatter.format(totalCostUsd)}`;

  const tooltipContent = (
    <Box sx={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 2, rowGap: 0.5 }}>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.currentContext")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {contextUsage?.tokens === null
          ? `? / ${formatDetailedTokenCount(contextWindow)} (?)`
          : `${formatDetailedTokenCount(contextTokens)} / ${formatDetailedTokenCount(contextWindow)} (${contextPercent}%)`}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.input")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {formatDetailedTokenCount(sessionStats?.tokens.input ?? usageSummary.inputTokens)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.output")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {formatDetailedTokenCount(sessionStats?.tokens.output ?? usageSummary.outputTokens)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.cacheRead")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {formatDetailedTokenCount(sessionStats?.tokens.cacheRead ?? usageSummary.cacheReadTokens)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.cacheWrite")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {formatDetailedTokenCount(sessionStats?.tokens.cacheWrite ?? usageSummary.cacheWriteTokens)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.cacheRate")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {`${usageSummary.cacheRatePercent}%`}
      </Typography>
      {usageSummary.reasoningTokens > 0 ? (
        <>
          <Typography
            variant="caption"
            sx={{
              color: "inherit",
            }}
          >
            {t("agentChat.usageSummary.reasoning")}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "inherit",
              textAlign: "right",
            }}
          >
            {formatDetailedTokenCount(usageSummary.reasoningTokens)}
          </Typography>
        </>
      ) : null}
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.sessionTotalCumulative")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {formatDetailedTokenCount(totalSessionTokens)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
        }}
      >
        {t("agentChat.usageSummary.cost")}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "inherit",
          textAlign: "right",
        }}
      >
        {usdFormatter.format(totalCostUsd)}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} placement="top">
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
        <Box
          component="span"
          sx={{
            color: getUsageSummaryColor(contextUsage?.tokens === null ? 0 : (contextPercent ?? 0), theme.palette.mode),
          }}
        >
          {` ${contextSummaryLabel.slice(4)}`}
        </Box>
        <Box component="span" sx={{ color: "text.disabled" }}>
          {`, ${usdFormatter.format(totalCostUsd)}`}
        </Box>
      </Box>
    </Tooltip>
  );
}
