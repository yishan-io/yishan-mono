import { getComposerCaretOffset, setComposerCaretOffset } from "./composerDom";
import type { ComposerTokenRange, RichComposerSlashCommand } from "./richComposerTypes";

const TOKEN_REGEX = /(https?:\/\/[^\s]+|\/[a-zA-Z][\w-]*|@[\w./-]+)/g;
const MENTION_TOKEN_REGEX = /^@[\w./-]*$/;

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function normalizeComposerText(value: string): string {
  return value.replaceAll("\u00A0", " ").replaceAll("\r\n", "\n");
}

/**
 * Gets the caret offset using the legacy richComposerText API.
 * @deprecated Import getComposerCaretOffset from composerDom instead.
 */
export function getCaretOffset(root: HTMLElement): number {
  return getComposerCaretOffset(root);
}

/**
 * Sets the caret offset using the legacy richComposerText API.
 * @deprecated Import setComposerCaretOffset from composerDom instead.
 */
export function setCaretOffset(root: HTMLElement, offset: number): void {
  setComposerCaretOffset(root, offset);
}

export function renderComposerHtml(value: string, slashCommands: RichComposerSlashCommand[] = []): string {
  const slashCommandCategoryByToken = new Map(
    slashCommands.map((command) => [(command.insertText ?? command.title).trim(), command.category] as const),
  );
  const tokenized = value
    .split(TOKEN_REGEX)
    .map((segment) => {
      if (segment.startsWith("http://") || segment.startsWith("https://")) {
        return `<a class="composer-link" href="${escapeHtmlAttribute(segment)}" target="_blank" rel="noreferrer">${escapeHtml(segment)}</a>`;
      }
      if (segment.startsWith("/")) {
        const slashCommandCategory = slashCommandCategoryByToken.get(segment);
        const slashClassName =
          slashCommandCategory === "skill"
            ? "composer-slash composer-slash-skill"
            : slashCommandCategory === "agent"
              ? "composer-slash composer-slash-agent"
              : "composer-slash";
        return `<span class="${slashClassName}">${escapeHtml(segment)}</span>`;
      }
      if (segment.startsWith("@")) {
        return `<span class="composer-mention">${escapeHtml(segment)}</span>`;
      }
      return escapeHtml(segment);
    })
    .join("");

  return tokenized.replaceAll("\n", "<br>");
}

export function findSlashCommandRange(value: string, caretOffset: number): ComposerTokenRange | null {
  if (caretOffset <= 0 || caretOffset > value.length) {
    return null;
  }

  const beforeCaret = value.slice(0, caretOffset);
  const tokenStart =
    Math.max(beforeCaret.lastIndexOf(" "), beforeCaret.lastIndexOf("\n"), beforeCaret.lastIndexOf("\t")) + 1;
  const token = beforeCaret.slice(tokenStart);

  if (!token.startsWith("/")) {
    return null;
  }

  if (token.includes("/") && token !== "/" && token.indexOf("/") !== 0) {
    return null;
  }

  return {
    start: tokenStart,
    end: caretOffset,
    query: token.slice(1).toLowerCase(),
  };
}

/**
 * Resolves the @ file mention token under the caret, or null when the caret is not inside one.
 * The range end extends past the caret to cover the full token so insertion removes it entirely.
 */
export function findMentionRange(value: string, caretOffset: number): ComposerTokenRange | null {
  if (caretOffset <= 0 || caretOffset > value.length) {
    return null;
  }

  const beforeCaret = value.slice(0, caretOffset);
  const tokenStart =
    Math.max(beforeCaret.lastIndexOf(" "), beforeCaret.lastIndexOf("\n"), beforeCaret.lastIndexOf("\t")) + 1;
  const token = beforeCaret.slice(tokenStart);

  if (!MENTION_TOKEN_REGEX.test(token)) {
    return null;
  }

  const tokenTail = value.slice(caretOffset).match(/^[\w./-]*/)?.[0] ?? "";
  return {
    start: tokenStart,
    end: caretOffset + tokenTail.length,
    query: token.slice(1).toLowerCase(),
  };
}

export function matchesSlashCommand(command: RichComposerSlashCommand, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const searchText = `${command.title} ${command.searchText ?? ""}`.toLowerCase();
  return searchText.includes(normalizedQuery);
}
