import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { type TruncationOptions, type TruncationResult, truncateHead } from "@earendil-works/pi-coding-agent";

/** Structured details attached to a truncated CodeGraph result. */
export interface CodeGraphResultDetails {
  /** Pi's complete truncation metadata. */
  readonly truncation: TruncationResult;
  /** Secure temporary path containing the complete untruncated result. */
  readonly fullOutputPath: string;
}

/** Formats a CodeGraph text response within Pi's output limits. */
export function formatCodeGraphResult(
  text: string,
  options?: TruncationOptions,
): { text: string; details: CodeGraphResultDetails | undefined } {
  const truncation = truncateHead(text, options);
  if (!truncation.truncated) return { text, details: undefined };
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "pi-codegraph-"));
  chmodSync(tempDirectory, 0o700);
  const fullOutputPath = path.join(tempDirectory, "output.txt");
  writeFileSync(fullOutputPath, text, { encoding: "utf8", mode: 0o600 });
  const notice = `\n\n[Output truncated. Full output: ${fullOutputPath}]`;
  return { text: `${truncation.content}${notice}`, details: { truncation, fullOutputPath } };
}

/** Makes in-project absolute CodeGraph paths root-relative and adds a no-match filter hint. */
export function normalizeCodeGraphFiles(
  text: string,
  projectPath: string,
  filters: { path?: unknown; pattern?: unknown } = {},
): string {
  const normalizedText = text
    .split("\n")
    .map((line) => normalizeFilePath(line, projectPath))
    .join("\n");
  if (!hasSuppliedFileFilter(filters) || !/\bno files? (?:matched|found matching)\b/i.test(normalizedText))
    return normalizedText;
  return `${normalizedText}\n[No files matched the supplied filter. Try a broader path or pattern.]`;
}

function normalizeFilePath(line: string, projectPath: string): string {
  if (!path.isAbsolute(line)) return line;
  const relativePath = path.relative(projectPath, line);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return line;
  return relativePath.split(path.sep).join("/");
}

function hasSuppliedFileFilter(filters: { path?: unknown; pattern?: unknown }): boolean {
  return typeof filters.path === "string" || typeof filters.pattern === "string";
}

/** Redacts common secret assignments and bounds diagnostic text. */
export function boundedDiagnostic(diagnostic: string, limit = 2_000): string {
  const redacted = diagnostic.replace(
    /(authorization\s*:\s*bearer(?:\s+|=)|--api-key(?:\s+|=)|(?:token|password|secret|api[_-]?key)\s*[=:]\s*)[^\s,]+/gi,
    "$1[REDACTED]",
  );
  return redacted.length <= limit ? redacted : `${redacted.slice(0, limit)}…[truncated]`;
}
