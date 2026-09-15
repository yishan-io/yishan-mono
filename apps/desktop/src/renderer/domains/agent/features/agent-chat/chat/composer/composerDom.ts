import { normalizeComposerText, renderComposerHtml } from "./richComposerText";
import type { RichComposerSlashCommand } from "./richComposerTypes";

/** Returns the normalized plain-text content of the composer. */
export function getComposerText(editable: HTMLElement): string {
  return normalizeComposerText(editable.innerText);
}

/** Returns the current composer caret offset, falling back to the end when selection is outside it. */
export function getComposerCaretOffset(root: HTMLElement): number {
  const fallbackOffset = getComposerText(root).length;
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

/** Returns whether the composer already has the expected rendered markup. */
export function hasComposerHtml(editable: HTMLDivElement, html: string): boolean {
  return editable.innerHTML === html;
}

/** Replaces composer markup using the token renderer. */
export function setComposerContent(
  editable: HTMLDivElement,
  value: string,
  slashCommands: RichComposerSlashCommand[] = [],
): void {
  editable.innerHTML = renderComposerHtml(value, slashCommands);
}

/** Moves the composer caret to a plain-text offset. */
export function setComposerCaretOffset(root: HTMLElement, offset: number): void {
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

/** Focuses the composer. */
export function focusComposer(editable: HTMLDivElement): void {
  editable.focus();
}

/** Inserts plain text at the browser's current composer selection. */
export function insertComposerPlainText(value: string): void {
  document.execCommand("insertText", false, value);
}

/** Inserts a literal space and emits the input event that synchronizes composer state. */
export function insertComposerLiteralSpace(editable: HTMLDivElement): void {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const space = document.createTextNode(" ");

  if (range && editable.contains(range.startContainer)) {
    range.deleteContents();
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  } else {
    editable.append(space);
  }

  editable.dispatchEvent(new Event("input", { bubbles: true }));
}
