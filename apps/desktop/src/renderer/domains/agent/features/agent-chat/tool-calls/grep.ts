import { resolveRelativePath, toWorkspaceRelativePath } from "@renderer/domains/files";
import { openTab } from "@renderer/domains/workbench";
import { getPathBaseName } from "./diff";

/** Parsed grep output row that can optionally open a file location. */
export type GrepMatchLine = {
  filePath: string;
  lineNumber: number;
  preview: string;
};

/** Parses grep output into clickable file-match rows. */
export function parseGrepMatchLines(resultText: string, grepPath: string | null): GrepMatchLine[] {
  return resultText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = /^(?<filePath>[^:]+):(?<lineNumber>\d+):\s?(?<preview>.*)$/.exec(line);
      if (!match?.groups) {
        return [];
      }

      const rawLineNumber = match.groups.lineNumber;
      if (!rawLineNumber) {
        return [];
      }

      const parsedLineNumber = Number.parseInt(rawLineNumber, 10);
      if (!Number.isFinite(parsedLineNumber) || parsedLineNumber < 1) {
        return [];
      }

      const rawFilePath = match.groups.filePath?.trim() ?? "";
      const filePath = resolveGrepFilePath(rawFilePath, grepPath);
      if (!filePath) {
        return [];
      }

      return [
        {
          filePath,
          lineNumber: parsedLineNumber,
          preview: match.groups.preview?.trim() ?? "",
        },
      ];
    });
}

/** Opens one grep match in the workspace file tab system. */
export function openGrepFileMatch(filePath: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, filePath);
  openTab({ kind: "file", path: toWorkspaceRelativePath(resolvedPath, workspacePath) });
}

function resolveGrepFilePath(rawFilePath: string, grepPath: string | null): string | null {
  if (rawFilePath.length === 0) {
    return null;
  }

  if (rawFilePath.includes("/") || rawFilePath.includes("\\")) {
    return rawFilePath;
  }

  if (grepPath && getPathBaseName(grepPath) === rawFilePath) {
    return grepPath;
  }

  return null;
}
