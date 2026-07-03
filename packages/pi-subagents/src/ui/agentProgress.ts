import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import type { AgentRecord } from "../agents/types";
import type { AgentManager } from "../runtime/agentManager";

const STATUS_KEY = "pi-subagents";
const WIDGET_KEY = "pi-subagents-progress";
const MAX_VISIBLE_ACTIVE_AGENTS = 5;
const ACTIVE_AGENT_STATUSES = new Set(["queued", "running"]);
const WORKING_MESSAGE_PREFIX = "Sub-agents";

/**
 * Subscribes the current session UI to live agent-progress updates.
 */
export function bindAgentProgressUi(manager: AgentManager, ui: ExtensionUIContext): () => void {
  const unsubscribe = manager.subscribe((records) => {
    renderAgentProgress(ui, records);
  });

  return () => {
    unsubscribe();
    clearAgentProgress(ui);
  };
}

/**
 * Renders live footer and widget updates for active sub-agents.
 */
export function renderAgentProgress(ui: ExtensionUIContext, records: AgentRecord[]): void {
  const activeRecords = records.filter((record) => ACTIVE_AGENT_STATUSES.has(record.status));
  if (activeRecords.length === 0) {
    clearAgentProgress(ui);
    return;
  }

  const runningCount = activeRecords.filter((record) => record.status === "running").length;
  const queuedCount = activeRecords.filter((record) => record.status === "queued").length;
  const statusParts = [
    runningCount > 0 ? `${runningCount} running` : undefined,
    queuedCount > 0 ? `${queuedCount} queued` : undefined,
  ].filter((value): value is string => Boolean(value));

  const statusSummary = statusParts.join(" · ");

  ui.setStatus(STATUS_KEY, ui.theme.fg("accent", `🤖 ${statusSummary}`));
  ui.setWidget(WIDGET_KEY, buildWidgetLines(ui, activeRecords));
  ui.setWorkingMessage(`${WORKING_MESSAGE_PREFIX}: ${statusSummary}`);
  ui.setWorkingVisible(true);
}

function clearAgentProgress(ui: ExtensionUIContext): void {
  ui.setStatus(STATUS_KEY, undefined);
  ui.setWidget(WIDGET_KEY, undefined);
  ui.setWorkingMessage();
  ui.setWorkingVisible(false);
}

function buildWidgetLines(ui: ExtensionUIContext, records: AgentRecord[]): string[] {
  const visibleRecords = records.slice(0, MAX_VISIBLE_ACTIVE_AGENTS);
  const hiddenCount = records.length - visibleRecords.length;
  const lines = [ui.theme.fg("accent", "Sub-agents")];

  for (const record of visibleRecords) {
    lines.push(formatAgentLine(ui, record));
  }

  if (hiddenCount > 0) {
    lines.push(ui.theme.fg("muted", `… ${hiddenCount} more`));
  }

  return lines;
}

function formatAgentLine(ui: ExtensionUIContext, record: AgentRecord): string {
  const statusSymbol = record.status === "running" ? ui.theme.fg("accent", "▶") : ui.theme.fg("muted", "…");
  const modeLabel = record.mode === "background" ? "bg" : "fg";
  return `${statusSymbol} ${record.agentName} · ${record.status} · ${modeLabel} · ${record.id}`;
}
