/**
 * Tool-result formatting: text content plus structured details, diagnostics
 * summaries, and edit summaries.
 */
import path from "node:path";

import type { DiagnosticEntry, DiagnosticSummary, ResolvedServer } from "../types";

/**
 * Builds a tool result with text content and structured details.
 */
export function textResult(text: string, details: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

/**
 * Formats diagnostics as a summary header plus one line per diagnostic.
 */
export function formatDiagnostics(server: ResolvedServer, entries: DiagnosticEntry[]): string {
  const lines = entries.flatMap((entry) => {
    if (entry.diagnostics.length === 0) return [`${entry.path}: no diagnostics`];
    return entry.diagnostics.map((diagnostic) => {
      const line = diagnostic.range.start.line + 1;
      const column = diagnostic.range.start.character + 1;
      const severity = severityName(diagnostic.severity);
      const source = diagnostic.source ?? server.name;
      const code = diagnostic.code === undefined ? "" : ` ${diagnostic.code}`;
      return `${entry.path}:${line}:${column}: ${severity} ${source}${code}: ${diagnostic.message}`;
    });
  });

  const summary = summarize(entries);
  return [
    `${server.name} LSP diagnostics: ${summary.diagnostics} diagnostic(s) across ${summary.files} file(s).`,
    "",
    ...lines,
  ].join("\n");
}

/**
 * Formats the outcome of a fix run, including the computed text when it was
 * not written.
 */
export function formatEditSummary(
  serverName: string,
  root: string,
  file: string,
  changed: boolean,
  write: boolean | undefined,
  text: string,
): string {
  const relativePath = path.relative(root, file) || file;
  const status = changed ? (write ? "updated" : "computed changes for") : "left unchanged";
  const summary = `${serverName} LSP fix ${status} ${relativePath}.`;
  if (write || !changed) return summary;
  return `${summary}\n\n${text}`;
}

/**
 * Counts files and diagnostics across entries.
 */
export function summarize(entries: DiagnosticEntry[]): DiagnosticSummary {
  return {
    files: entries.length,
    diagnostics: entries.reduce((total, entry) => total + entry.diagnostics.length, 0),
  };
}

/**
 * Maps LSP severity numbers to readable names.
 */
function severityName(severity: number | undefined): string {
  if (severity === 1) return "error";
  if (severity === 2) return "warning";
  if (severity === 3) return "info";
  if (severity === 4) return "hint";
  return "diagnostic";
}
