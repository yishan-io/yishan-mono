/** LSP diagnostics totals parsed from the tool result header lines. */
export type LspDiagnosticsSummary = {
  servers: string[];
  totalDiagnostics: number;
  totalFiles: number;
};

/**
 * Parses per-server diagnostic totals from lsp_diagnostics result text.
 * Each section header looks like "<server> LSP diagnostics: N diagnostic(s)
 * across M file(s).". Returns null when no header line is found.
 */
export function parseLspDiagnosticsSummary(resultText: string): LspDiagnosticsSummary | null {
  const servers: string[] = [];
  let totalDiagnostics = 0;
  let totalFiles = 0;
  let found = false;

  for (const line of resultText.split("\n")) {
    const match =
      /^(?<server>.+?) LSP diagnostics: (?<diagnostics>\d+) diagnostic\(s\) across (?<files>\d+) file\(s\)\.$/.exec(
        line.trim(),
      );
    if (!match?.groups) {
      continue;
    }
    const server = match.groups.server ?? "";
    const diagnostics = Number.parseInt(match.groups.diagnostics ?? "0", 10);
    const files = Number.parseInt(match.groups.files ?? "0", 10);
    if (!server || !Number.isFinite(diagnostics) || !Number.isFinite(files)) {
      continue;
    }
    servers.push(server);
    totalDiagnostics += diagnostics;
    totalFiles += files;
    found = true;
  }

  return found ? { servers, totalDiagnostics, totalFiles } : null;
}

/** LSP fix outcome parsed from the tool result first line. */
export type LspFixSummary = {
  server: string;
  status: "updated" | "computed" | "unchanged";
  path: string;
};

/**
 * Parses the lsp_fix outcome from result text shaped like
 * "<server> LSP fix updated src/a.ts." (or "computed changes for"/
 * "left unchanged"). Returns null when no match is found.
 */
export function parseLspFixSummary(resultText: string): LspFixSummary | null {
  const firstLine = resultText.split("\n").find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }

  const match = /^(.+?) LSP fix (updated|computed changes for|left unchanged) (.+)\.$/.exec(firstLine.trim());
  const server = match?.[1];
  const action = match?.[2];
  const path = match?.[3];
  if (!server || !action || !path) {
    return null;
  }

  const status: LspFixSummary["status"] =
    action === "updated" ? "updated" : action === "computed changes for" ? "computed" : "unchanged";
  return { server, status, path };
}

/** Returns the badge color used for lsp_fix outcomes. */
export function getLspFixStatusColor(status: LspFixSummary["status"]): string {
  switch (status) {
    case "updated":
      return "success.main";
    case "computed":
      return "info.main";
    case "unchanged":
      return "text.secondary";
  }
}

/** Parses the workspace count from a workspace_list tool result. */
export function parseWorkspaceListCount(resultText: string): number | null {
  if (!resultText.trim()) {
    return null;
  }

  if (resultText.trim().startsWith("No workspaces")) {
    return 0;
  }

  try {
    const parsed = JSON.parse(resultText);
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
  } catch {
    // not parseable JSON
  }

  return null;
}
