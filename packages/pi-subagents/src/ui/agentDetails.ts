import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import type { AgentRecord } from "../agents/types";

const DETAIL_WIDGET_KEY = "pi-subagents-selected-agent";
const MAX_ACTIVITY_LINES = 6;
const MAX_PROMPT_PREVIEW_LENGTH = 120;

/**
 * Renders a persistent detail widget for one selected sub-agent.
 */
export function renderSelectedAgentDetails(ui: ExtensionUIContext, record: AgentRecord): void {
  const lines = [ui.theme.fg("accent", "Selected sub-agent")];
  lines.push(
    `${formatStatusSymbol(ui, record.status)} ${record.agentName} · ${record.status} · ${record.mode} · ${record.id}`,
  );
  lines.push(ui.theme.fg("dim", truncateSingleLine(record.prompt, MAX_PROMPT_PREVIEW_LENGTH)));

  const activityLines = getRecentActivityLines(record.session?.messages ?? [], record.responseText, record.error);
  if (activityLines.length > 0) {
    lines.push("");
    lines.push(ui.theme.fg("muted", "Recent activity"));
    lines.push(...activityLines.map((line) => ui.theme.fg("text", line)));
  }

  if (record.transcriptPath) {
    lines.push("");
    lines.push(ui.theme.fg("dim", `transcript: ${record.transcriptPath}`));
  }

  lines.push("");
  lines.push(ui.theme.fg("muted", "Use /agent-steer <id> ... or /agent-stop <id>"));
  lines.push(ui.theme.fg("muted", "Use /agent-view-clear to close this panel"));

  ui.setWidget(DETAIL_WIDGET_KEY, lines, { placement: "belowEditor" });
}

/**
 * Clears the selected sub-agent detail widget.
 */
export function clearSelectedAgentDetails(ui: ExtensionUIContext): void {
  ui.setWidget(DETAIL_WIDGET_KEY, undefined, { placement: "belowEditor" });
}

function formatStatusSymbol(ui: ExtensionUIContext, status: AgentRecord["status"]): string {
  if (status === "completed") {
    return ui.theme.fg("success", "✓");
  }

  if (status === "failed" || status === "cancelled") {
    return ui.theme.fg("error", "✗");
  }

  if (status === "running") {
    return ui.theme.fg("accent", "⠿");
  }

  return ui.theme.fg("warning", "…");
}

function getRecentActivityLines(messages: AgentMessage[], responseText?: string, error?: string): string[] {
  const activityLines = messages
    .flatMap((message) => toActivityLine(message))
    .filter(Boolean)
    .slice(-MAX_ACTIVITY_LINES);

  if (activityLines.length > 0) {
    return activityLines;
  }

  if (responseText) {
    return [`assistant: ${truncateSingleLine(responseText, MAX_PROMPT_PREVIEW_LENGTH)}`];
  }

  if (error) {
    return [`error: ${truncateSingleLine(error, MAX_PROMPT_PREVIEW_LENGTH)}`];
  }

  return ["(waiting for output)"];
}

function toActivityLine(message: AgentMessage): string[] {
  if (message.role === "assistant" && Array.isArray(message.content)) {
    const assistantText = message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (assistantText.length === 0) {
      return [];
    }

    return [`assistant: ${truncateSingleLine(assistantText, MAX_PROMPT_PREVIEW_LENGTH)}`];
  }

  if (message.role === "toolResult") {
    const contentText = message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const suffix = contentText.length > 0 ? ` · ${truncateSingleLine(contentText, MAX_PROMPT_PREVIEW_LENGTH)}` : "";
    return [`tool:${message.toolName}${message.isError ? " ✗" : " ✓"}${suffix}`];
  }

  return [];
}

function truncateSingleLine(text: string, maxLength: number): string {
  const normalizedText = text.replaceAll(/\s+/g, " ").trim();
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength - 3)}...`;
}
