import { Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { type AgentToolCallCardProps } from "./helpers";

type AskUserOption = {
  title?: unknown;
  description?: unknown;
  label?: unknown;
  text?: unknown;
  value?: unknown;
  name?: unknown;
  option?: unknown;
};

type AskUserDetails = {
  question?: unknown;
  context?: unknown;
  options?: AskUserOption[];
  cancelled?: unknown;
  unavailableReason?: unknown;
  response?:
    | {
        kind?: unknown;
        selections?: unknown;
      }
    | {
        kind?: unknown;
        text?: unknown;
      };
};

/** Renders a compact ask_user summary in the agent transcript. */
export function AskUserToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const { t } = useTranslation();
  const [question, answer] = useMemo(() => {
    const argsQuestion = typeof toolCall.arguments.question === "string" ? toolCall.arguments.question : null;
    const details = (result?.details ?? null) as AskUserDetails | null;
    const detailsQuestion = typeof details?.question === "string" ? details.question : null;
    const nextQuestion = detailsQuestion ?? argsQuestion ?? "ask_user";
    return [nextQuestion, buildAnswerSummary(details, t)] as const;
  }, [result?.details, t, toolCall.arguments.question]);

  return (
    <ToolCardShell isError={result?.isError === true} outlined>
      <ToolSummaryPanel>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {t("agentChat.askUser.card.question")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {question}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {t("agentChat.askUser.card.answer")}
        </Typography>
        <Typography variant="body2">{answer}</Typography>
      </ToolSummaryPanel>
    </ToolCardShell>
  );
}

function buildAnswerSummary(details: AskUserDetails | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!details) {
    return t("agentChat.askUser.card.pending");
  }

  if (typeof details.unavailableReason === "string" && details.unavailableReason.trim().length > 0) {
    return t("agentChat.askUser.card.unavailable", { reason: details.unavailableReason });
  }

  if (details.cancelled === true || details.response == null) {
    return t("agentChat.askUser.card.cancelled");
  }

  const response = details.response as Record<string, unknown>;

  if (response.kind === "freeform" && typeof response.text === "string") {
    return response.text;
  }

  if (response.kind === "selection" && Array.isArray(response.selections)) {
    const selections = response.selections.filter(
      (selection): selection is string => typeof selection === "string" && selection.trim().length > 0,
    );
    if (selections.length > 0) {
      return selections.join(", ");
    }
  }

  return t("agentChat.askUser.card.answered");
}
