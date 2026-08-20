import { useMemo, useState } from "react";
import { LuBug, LuHammer } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { extractResultText } from "./diff";
import { getLspFixStatusColor, parseLspDiagnosticsSummary, parseLspFixSummary } from "./lsp";
import type { AgentToolCallCardProps } from "./summary";

/**
 * Renders the lsp_diagnostics and lsp_fix tool-call cards: a compact summary
 * (server + diagnostic totals or fix outcome) with the raw result text
 * expandable below.
 */
export function LspToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const isError = result?.isError === true;
  const isDiagnostics = toolCall.name === "lsp_diagnostics";

  const summary = useMemo(
    () => (isDiagnostics ? buildDiagnosticsSummary(resultText) : buildFixSummary(resultText)),
    [isDiagnostics, resultText],
  );

  return (
    <ToolCardShell isError={isError}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={isDiagnostics ? <LuBug size={14} /> : <LuHammer size={14} />}
            path={summary.label}
            suffix={summary.badge ? <ToolSummaryBadge label={summary.badge.label} color={summary.badge.color} /> : null}
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection
        open={open}
        resultText={resultText}
        isError={isError}
        label={isDiagnostics ? "diagnostics" : "fix result"}
      />
    </ToolCardShell>
  );
}

/**
 * Builds the diagnostics card summary from the parsed result, falling back
 * to a generic label while the result is pending.
 */
function buildDiagnosticsSummary(resultText: string): {
  label: string;
  badge: { label: string; color: string } | null;
} {
  const parsed = parseLspDiagnosticsSummary(resultText);
  if (!parsed) {
    return { label: "diagnostics", badge: null };
  }

  const serverLabel = parsed.servers.length === 1 ? parsed.servers[0] : `${parsed.servers.length} servers`;
  const badge =
    parsed.totalDiagnostics === 0
      ? { label: "no diagnostics", color: "success.main" }
      : {
          label: `${parsed.totalDiagnostics} diagnostic${parsed.totalDiagnostics !== 1 ? "s" : ""} across ${parsed.totalFiles} file${parsed.totalFiles !== 1 ? "s" : ""}`,
          color: "warning.main",
        };
  return { label: `${serverLabel} diagnostics`, badge };
}

/**
 * Builds the fix card summary from the parsed result, falling back to a
 * generic label while the result is pending.
 */
function buildFixSummary(resultText: string): { label: string; badge: { label: string; color: string } | null } {
  const parsed = parseLspFixSummary(resultText);
  if (!parsed) {
    return { label: "fix", badge: null };
  }

  return {
    label: `${parsed.server} fix · ${parsed.path}`,
    badge: { label: parsed.status, color: getLspFixStatusColor(parsed.status) },
  };
}
