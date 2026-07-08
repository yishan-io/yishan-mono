import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import type { AgentRecord } from "../agents/types";
import type { AgentManager } from "../runtime/agentManager";

const STATUS_KEY = "pi-subagents";
const WIDGET_KEY = "pi-subagents-progress";
const MAX_VISIBLE_ACTIVE_AGENTS = 5;
const ACTIVE_AGENT_STATUSES = new Set(["queued", "running"]);
const RUNNING_AGENT_STATUSES = new Set(["running"]);
const PREPARING_MESSAGE = "preparing delegation";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

/**
 * Subscribes the current session UI to live agent-progress updates.
 */
export function bindAgentProgressUi(manager: AgentManager, ui: ExtensionUIContext): () => void {
  let latestRecords: AgentRecord[] = [];
  let spinnerFrameIndex = 0;
  let spinnerInterval: ReturnType<typeof setInterval> | undefined;
  let hadActiveAgents = false;

  const stopSpinner = () => {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = undefined;
    }
  };

  const syncSpinner = () => {
    const hasRunningAgents = latestRecords.some((record) => RUNNING_AGENT_STATUSES.has(record.status));
    if (!hasRunningAgents) {
      stopSpinner();
      spinnerFrameIndex = 0;
      return;
    }

    if (spinnerInterval) {
      return;
    }

    spinnerInterval = setInterval(() => {
      spinnerFrameIndex = (spinnerFrameIndex + 1) % SPINNER_FRAMES.length;
      renderAgentProgress(ui, latestRecords, spinnerFrameIndex);
    }, SPINNER_INTERVAL_MS);
  };

  const unsubscribe = manager.subscribe((records) => {
    latestRecords = records;
    syncSpinner();

    const hasActiveAgents = records.some((record) => ACTIVE_AGENT_STATUSES.has(record.status));
    if (!hasActiveAgents) {
      clearAgentProgress(ui, { restoreWorkingVisibility: hadActiveAgents });
      hadActiveAgents = false;
      return;
    }

    hadActiveAgents = true;
    renderAgentProgress(ui, latestRecords, spinnerFrameIndex);
  });

  return () => {
    stopSpinner();
    unsubscribe();
    clearAgentProgress(ui, { restoreWorkingVisibility: hadActiveAgents });
  };
}

/**
 * Renders live footer and widget updates for active sub-agents.
 */
export function renderAgentProgress(ui: ExtensionUIContext, records: AgentRecord[], spinnerFrameIndex = 0): void {
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
  ui.setWidget(WIDGET_KEY, buildWidgetLines(ui, activeRecords, spinnerFrameIndex));
  ui.setWorkingMessage();
  ui.setWorkingVisible(false);
}

export function renderPendingDelegation(ui: ExtensionUIContext, agentNames: string[]): void {
  const lines = [ui.theme.fg("accent", "Sub-agents")];

  for (const agentName of agentNames.slice(0, MAX_VISIBLE_ACTIVE_AGENTS)) {
    lines.push(`${ui.theme.fg("warning", "…")} ${agentName} · preparing`);
  }

  if (agentNames.length > MAX_VISIBLE_ACTIVE_AGENTS) {
    lines.push(ui.theme.fg("muted", `… ${agentNames.length - MAX_VISIBLE_ACTIVE_AGENTS} more`));
  }

  ui.setStatus(STATUS_KEY, ui.theme.fg("warning", `🤖 ${PREPARING_MESSAGE}`));
  ui.setWidget(WIDGET_KEY, lines);
  ui.setWorkingMessage();
  ui.setWorkingVisible(false);
}

export function clearAgentProgress(ui: ExtensionUIContext, options: { restoreWorkingVisibility?: boolean } = {}): void {
  ui.setStatus(STATUS_KEY, undefined);
  ui.setWidget(WIDGET_KEY, undefined);
  ui.setWorkingMessage();

  if (options.restoreWorkingVisibility ?? true) {
    ui.setWorkingVisible(true);
  }
}

function buildWidgetLines(ui: ExtensionUIContext, records: AgentRecord[], spinnerFrameIndex: number): string[] {
  const visibleRecords = records.slice(0, MAX_VISIBLE_ACTIVE_AGENTS);
  const hiddenCount = records.length - visibleRecords.length;
  const lines = [ui.theme.fg("accent", "Sub-agents")];

  for (const record of visibleRecords) {
    lines.push(formatAgentLine(ui, record, spinnerFrameIndex));
  }

  if (hiddenCount > 0) {
    lines.push(ui.theme.fg("muted", `… ${hiddenCount} more`));
  }

  return lines;
}

function formatAgentLine(ui: ExtensionUIContext, record: AgentRecord, spinnerFrameIndex: number): string {
  const spinnerFrame = SPINNER_FRAMES[spinnerFrameIndex] ?? "⠋";
  const statusSymbol = record.status === "running" ? ui.theme.fg("accent", spinnerFrame) : ui.theme.fg("muted", "…");
  const modeLabel = record.mode === "background" ? "bg" : "fg";
  return `${statusSymbol} ${record.agentName} · ${record.status} · ${modeLabel} · ${record.id}`;
}
