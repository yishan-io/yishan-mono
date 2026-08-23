import { Box, CircularProgress, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { COLOR_PRIMITIVES, type DesignTokenThemeMode } from "@yishan-io/design-tokens/v1";
import { type MouseEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";
import {
  type AgentChatUsageSummary,
  buildAgentChatUsageSummary,
  getAgentChatBilledTokenTotal,
  roundContextPercent,
} from "../../../../../domains/agent/chat/agentChatUsageSummary";
import { agentChatStore } from "../../../../../domains/agent/state/agentChatStore";
import {
  type AgentChatUsageLedger,
  getAgentChatUsageLedgerTotal,
} from "../../../../../domains/agent/state/agentChatUsageLedger";
import { formatDetailedTokenCount } from "./agentChatUsageFormatting";

const EMPTY_MESSAGES: AgentMessage[] = [];
const CONTEXT_PROGRESS_SIZE_PX = 16;
const CONTEXT_PROGRESS_THICKNESS = 5;
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

/** Combines retained authoritative parent billing with live parent deltas and completed child usage. */
export function composeAgentChatUsageSummary(
  usageSummary: AgentChatUsageSummary,
  usageLedger: AgentChatUsageLedger,
): AgentChatUsageSummary {
  const billedUsage = getAgentChatUsageLedgerTotal(usageLedger);
  const cacheableTokens = billedUsage.input + billedUsage.cacheRead;

  return {
    ...usageSummary,
    inputTokens: billedUsage.input,
    outputTokens: billedUsage.output,
    cacheReadTokens: billedUsage.cacheRead,
    cacheWriteTokens: billedUsage.cacheWrite,
    cacheRatePercent: cacheableTokens > 0 ? Math.round((billedUsage.cacheRead / cacheableTokens) * 100) : 0,
    totalSessionTokens: getAgentChatBilledTokenTotal(billedUsage),
    totalCostUsd: billedUsage.cost,
  };
}

/** Renders the live agent-chat context/cost summary without rerendering sibling controls. */
export function AgentChatUsageSummaryLabel({ tabId }: AgentChatUsageSummaryLabelProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const currentModel = agentChatStore((state) => state.sessionsByTabId[tabId]?.currentModel ?? null);
  const messages = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages ?? EMPTY_MESSAGES);
  const streamingMessage = agentChatStore((state) => state.sessionsByTabId[tabId]?.streamingMessage ?? null);
  const sessionStats = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionStats ?? null);
  const usageLedger = agentChatStore((state) => state.sessionsByTabId[tabId]?.usageLedger ?? null);
  // sessionStats is nulled at turn start (invalidateAgentSessionStats), so during a turn
  // the ?? fallbacks below surface the live estimate built from messages + streamingMessage.
  // Once the turn settles, agent_settled refreshes the authoritative snapshot again.
  const usageSummary = useMemo(() => {
    const messagesForUsage = streamingMessage ? [...messages, streamingMessage] : messages;
    const derivedUsageSummary = buildAgentChatUsageSummary(messagesForUsage, currentModel);
    return derivedUsageSummary && usageLedger
      ? composeAgentChatUsageSummary(derivedUsageSummary, usageLedger)
      : derivedUsageSummary;
  }, [currentModel, messages, streamingMessage, usageLedger]);

  const [usageDetailsAnchor, setUsageDetailsAnchor] = useState<HTMLElement | null>(null);

  if (!usageSummary) {
    return null;
  }

  const contextUsage = sessionStats?.contextUsage;
  const contextTokens = contextUsage?.tokens ?? usageSummary.contextTokens;
  const contextWindow = contextUsage?.contextWindow ?? usageSummary.contextWindow;
  const contextPercent = roundContextPercent(contextUsage?.percent ?? usageSummary.contextPercent);
  const isContextUsageUnknown = contextUsage?.tokens === null;
  const contextDisplayPercent =
    isContextUsageUnknown || !Number.isFinite(contextPercent) ? 0 : Math.min(100, Math.max(0, contextPercent));
  const contextTokensLabel = formatDetailedTokenCount(contextTokens);
  const contextWindowLabel = formatDetailedTokenCount(contextWindow);
  const contextTooltipLabel = isContextUsageUnknown
    ? `? / ${contextWindowLabel} (?)`
    : `${contextTokensLabel} / ${contextWindowLabel} (${contextPercent}%)`;
  const contextAriaLabel = t("agentChat.usageSummary.contextUsageButton", {
    usage: isContextUsageUnknown
      ? t("agentChat.usageSummary.contextUnknown", { contextWindow: contextWindowLabel })
      : t("agentChat.usageSummary.contextKnown", {
          contextPercent,
          contextTokens: contextTokensLabel,
          contextWindow: contextWindowLabel,
        }),
  });
  const totalSessionTokens = usageSummary.totalSessionTokens;
  const totalCostUsd = usageSummary.totalCostUsd;

  const contextTooltipContent = (
    <Box sx={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 2, rowGap: 0.5 }}>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {t("agentChat.usageSummary.currentContext")}
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit", textAlign: "right" }}>
        {contextTooltipLabel}
      </Typography>
    </Box>
  );

  const detailedUsageContent = (
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
        {contextTooltipLabel}
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
        {formatDetailedTokenCount(usageSummary.inputTokens)}
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
        {formatDetailedTokenCount(usageSummary.outputTokens)}
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
        {formatDetailedTokenCount(usageSummary.cacheReadTokens)}
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
        {formatDetailedTokenCount(usageSummary.cacheWriteTokens)}
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

  const handleUsageDetailsOpen = (event: MouseEvent<HTMLElement>) => {
    setUsageDetailsAnchor(event.currentTarget);
  };
  const handleUsageDetailsClose = () => {
    setUsageDetailsAnchor(null);
  };

  return (
    <>
      <Tooltip describeChild title={contextTooltipContent} placement="top">
        <IconButton
          aria-expanded={Boolean(usageDetailsAnchor)}
          aria-haspopup="dialog"
          aria-label={contextAriaLabel}
          onClick={handleUsageDetailsOpen}
          size="small"
          sx={{ p: 0.25 }}
        >
          <CircularProgress
            aria-hidden
            color="inherit"
            data-testid="context-usage-progress"
            enableTrackSlot
            size={CONTEXT_PROGRESS_SIZE_PX}
            thickness={CONTEXT_PROGRESS_THICKNESS}
            value={contextDisplayPercent}
            variant="determinate"
            sx={{
              "& .MuiCircularProgress-track": { color: "text.secondary", opacity: 1 },
              color: getUsageSummaryColor(contextDisplayPercent, theme.palette.mode),
            }}
          />
        </IconButton>
      </Tooltip>
      <Popover
        anchorEl={usageDetailsAnchor}
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        onClose={handleUsageDetailsClose}
        open={Boolean(usageDetailsAnchor)}
        slotProps={{ paper: { "aria-label": t("agentChat.usageSummary.details"), role: "dialog", sx: { p: 1.5 } } }}
        transformOrigin={{ horizontal: "center", vertical: "top" }}
      >
        {detailedUsageContent}
      </Popover>
    </>
  );
}
