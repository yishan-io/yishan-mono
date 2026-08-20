/**
 * Pure helpers for comparing markdown content to avoid unnecessary editor resets.
 *
 * Keeps cursor/selection intact by only applying external content when it
 * genuinely differs from the last emitted markdown.
 */

/**
 * Normalizes markdown for comparison by collapsing CRLF to LF and trimming
 * trailing newlines. Vditor emits markdown with a trailing newline;
 * incoming content may use CRLF or not. This makes the comparison insensitive
 * to both differences.
 */
export function normalizeMarkdown(md: string): string {
  return md.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

/**
 * Returns `true` when external content should be applied to the editor.
 *
 * @param lastEmitted - The last markdown string emitted by the editor's
 *   `onMarkdownChange` callback (already normalized).
 * @param incomingContent - The content coming from an external source
 *   (e.g. file changed on disk or another tab sync).
 */
export function shouldApplyExternalContent(lastEmitted: string, incomingContent: string): boolean {
  return normalizeMarkdown(lastEmitted) !== normalizeMarkdown(incomingContent);
}
