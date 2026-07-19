import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import type { AgentRecord } from "../agents/types";

const MAX_ACTIVITY_LINES = 8;
const MAX_PREVIEW_LENGTH = 120;

export function formatAgentStatusSymbol(ui: ExtensionUIContext, status: AgentRecord["status"]): string {
  if (status === "completed") {
    return ui.theme.fg("success", "✓");
  }

  if (status === "failed" || status === "cancelled") {
    return ui.theme.fg("error", "✗");
  }

  if (status === "starting" || status === "running") {
    return ui.theme.fg("accent", "⠿");
  }

  return ui.theme.fg("warning", "…");
}

export function getRecentActivityLines(messages: AgentMessage[], responseText?: string, error?: string): string[] {
  const activityLines = messages
    .flatMap((message) => toActivityLine(message))
    .filter(Boolean)
    .slice(-MAX_ACTIVITY_LINES);

  if (activityLines.length > 0) {
    return activityLines;
  }

  if (responseText) {
    return [`assistant: ${truncateSingleLine(responseText, MAX_PREVIEW_LENGTH)}`];
  }

  if (error) {
    return [`error: ${truncateSingleLine(error, MAX_PREVIEW_LENGTH)}`];
  }

  return ["(waiting for output)"];
}

export function truncateSingleLine(text: string, maxLength: number): string {
  const normalizedText = text.replaceAll(/\s+/g, " ").trim();
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength - 3)}...`;
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

    return [`assistant: ${truncateSingleLine(assistantText, MAX_PREVIEW_LENGTH)}`];
  }

  if (message.role === "toolResult") {
    const contentText = message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const suffix = contentText.length > 0 ? ` · ${truncateSingleLine(contentText, MAX_PREVIEW_LENGTH)}` : "";
    return [`tool:${message.toolName}${message.isError ? " ✗" : " ✓"}${suffix}`];
  }

  if (message.role === "user") {
    const contentText = typeof message.content === "string" ? message.content : "";
    if (contentText.trim().length === 0) {
      return [];
    }

    return [`user: ${truncateSingleLine(contentText, MAX_PREVIEW_LENGTH)}`];
  }

  return [];
}
