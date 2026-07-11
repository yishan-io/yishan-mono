import type { RichComposerSlashCommand, SlashCommandRange } from "./richComposerTypes";

const TOKEN_REGEX = /(https?:\/\/[^\s]+|\/[a-zA-Z][\w-]*|@[\w./-]+)/g;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeComposerText(value: string): string {
  return value.replaceAll("\u00A0", " ").replaceAll("\r\n", "\n");
}

export function renderComposerHtml(value: string, slashCommands: RichComposerSlashCommand[] = []): string {
  const slashCommandCategoryByToken = new Map(
    slashCommands.map((command) => [(command.insertText ?? command.title).trim(), command.category] as const),
  );
  const escaped = escapeHtml(value);
  const tokenized = escaped.replaceAll(TOKEN_REGEX, (token) => {
    if (token.startsWith("http://") || token.startsWith("https://")) {
      return `<a class="composer-link" href="${token}" target="_blank" rel="noreferrer">${token}</a>`;
    }
    if (token.startsWith("/")) {
      const slashCommandCategory = slashCommandCategoryByToken.get(token);
      const slashClassName =
        slashCommandCategory === "skill"
          ? "composer-slash composer-slash-skill"
          : slashCommandCategory === "agent"
            ? "composer-slash composer-slash-agent"
            : "composer-slash";
      return `<span class="${slashClassName}">${token}</span>`;
    }
    if (token.startsWith("@")) {
      return `<span class="composer-mention">${token}</span>`;
    }
    return token;
  });

  return tokenized.replaceAll("\n", "<br>");
}

export function getCaretOffset(root: HTMLElement): number {
  const fallbackOffset = normalizeComposerText(root.innerText).length;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return fallbackOffset;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return fallbackOffset;
  }
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(root);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
}

export function setCaretOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const text = currentNode.textContent ?? "";
    const end = traversed + text.length;
    if (offset <= end) {
      const range = document.createRange();
      range.setStart(currentNode, Math.max(0, offset - traversed));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    traversed = end;
    currentNode = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function findSlashCommandRange(value: string, caretOffset: number): SlashCommandRange | null {
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

export function matchesSlashCommand(command: RichComposerSlashCommand, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const searchText = `${command.title} ${command.searchText ?? ""}`.toLowerCase();
  return searchText.includes(normalizedQuery);
}
