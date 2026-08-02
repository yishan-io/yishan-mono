/**
 * LSP text-edit helpers: offset/position conversion, edit application, and
 * conflict detection.
 */
import type { LspPosition, LspTextEdit, WorkspaceEdit } from "../types";

/**
 * Converts a character offset into a zero-based LSP position, clamping into
 * the text length.
 */
export function offsetToPosition(text: string, offset: number): LspPosition {
  const bounded = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < bounded; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, character: bounded - lineStart };
}

/**
 * Converts a zero-based LSP position into a character offset, clamped to the
 * end of the line or document.
 */
function positionToOffset(text: string, position: LspPosition): number {
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < text.length && line < position.line; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }
  if (line < position.line) return text.length;

  let lineEnd = text.indexOf("\n", lineStart);
  if (lineEnd < 0) lineEnd = text.length;
  return Math.min(lineStart + position.character, lineEnd);
}

/**
 * Applies edits to text. Edits are applied in reverse order so earlier
 * offsets stay valid. Insertions never conflict with each other.
 */
export function applyEdits(text: string, edits: LspTextEdit[]): string {
  let output = text;
  const positioned = positionEdits(text, edits).sort((left, right) => {
    if (left.start !== right.start) return right.start - left.start;
    if (left.end !== right.end) return right.end - left.end;
    return right.index - left.index;
  });

  for (const { edit, start, end } of positioned) {
    output = `${output.slice(0, start)}${edit.newText}${output.slice(end)}`;
  }
  return output;
}

/**
 * Returns whether any two edits overlap in a way that prevents a
 * deterministic application. An insertion strictly inside a replacement
 * range conflicts; two insertions never do.
 */
export function hasConflictingEdits(text: string, edits: LspTextEdit[]): boolean {
  const positioned = positionEdits(text, edits);
  for (let leftIndex = 0; leftIndex < positioned.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < positioned.length; rightIndex += 1) {
      const left = positioned[leftIndex];
      const right = positioned[rightIndex];
      if (!left || !right) continue;
      if (rangesConflict(left, right)) return true;
    }
  }
  return false;
}

/**
 * Converts edits to byte offsets with their original index for stable
 * sorting.
 */
function positionEdits(text: string, edits: LspTextEdit[]) {
  return edits.map((edit, index) => ({
    edit,
    index,
    start: positionToOffset(text, edit.range.start),
    end: positionToOffset(text, edit.range.end),
  }));
}

/**
 * Returns whether two positioned edit ranges conflict.
 */
function rangesConflict(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  if (left.start === left.end && right.start === right.end) return false;

  if (left.start === left.end || right.start === right.end) {
    const insertion = left.start === left.end ? left : right;
    const replacement = left.start === left.end ? right : left;
    return replacement.start < insertion.start && insertion.start < replacement.end;
  }

  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

/**
 * Collects the edits targeting the given uri from a workspace edit,
 * covering both the documentChanges and flat changes representations.
 */
export function collectEditsForUri(edit: WorkspaceEdit | undefined, uri: string): LspTextEdit[] {
  if (!edit) return [];
  if (edit.documentChanges) {
    return edit.documentChanges.flatMap((change) => (change.textDocument?.uri === uri ? (change.edits ?? []) : []));
  }
  return edit.changes?.[uri] ?? [];
}
