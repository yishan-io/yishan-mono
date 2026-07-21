import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { AskResultDetails } from "./types";

/**
 * Builds a compact transcript summary for an ask_user result.
 */
export function buildAskUserSummary(details: AskResultDetails): string {
  if (details.unavailableReason) {
    return `Unavailable: ${details.unavailableReason}`;
  }

  if (details.cancelled || !details.response) {
    return "Cancelled";
  }

  if (details.response.kind === "freeform") {
    return details.response.text;
  }

  return details.response.selections.join(", ");
}

/**
 * Renders an ask_user tool result for the Pi transcript.
 */
export function renderAskUserResult(details: AskResultDetails, theme: Theme): Text {
  const lines = [`Q: ${details.question}`, `A: ${buildAskUserSummary(details)}`];
  return new Text(lines.map((line) => theme.fg("text", line)).join("\n"), 1, 0);
}
