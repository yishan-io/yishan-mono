// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { insertComposerLiteralSpace } from "./composerDom";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("insertComposerLiteralSpace", () => {
  it.each([
    { name: "end", start: 4, end: 4, expected: "测试文本 " },
    { name: "middle", start: 2, end: 2, expected: "测试 文本" },
    { name: "selected replacement", start: 1, end: 3, expected: "测 本" },
  ])("notifies with a collapsed caret inside the inserted space at $name", ({ start, end, expected }) => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const text = document.createTextNode("测试文本");
    editor.append(text);
    document.body.append(editor);
    const selection = window.getSelection();
    if (!selection) throw new Error("Selection unavailable");
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    selection.removeAllRanges();
    selection.addRange(range);

    // Capture synchronously: input consumers must already see the corrected caret.
    const notifications: { container: Node; offset: number; collapsed: boolean; text: string | null }[] = [];
    document.body.addEventListener(
      "input",
      () => {
        const caret = selection.getRangeAt(0);
        notifications.push({
          container: caret.startContainer,
          offset: caret.startOffset,
          collapsed: caret.collapsed,
          text: editor.textContent,
        });
      },
      { once: true },
    );

    insertComposerLiteralSpace(editor);

    expect(notifications).toHaveLength(1);
    expect(editor.textContent).toBe(expected);
    const space = text.nextSibling;
    expect(space).toBeInstanceOf(Text);
    expect(space?.textContent).toBe(" ");
    expect(notifications[0]).toEqual({ container: space, offset: 1, collapsed: true, text: expected });
    expect(selection.anchorNode).toBe(space);
    expect(selection.anchorOffset).toBe(1);
    expect(selection.isCollapsed).toBe(true);
  });
});
