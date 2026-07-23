// @vitest-environment jsdom

import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FILETREE_DRAG_MIME } from "./FileTree/dataTransfer";
import { RichComposer, type RichComposerSlashCommand } from "./RichComposer";
import { getCaretOffset, renderComposerHtml, setCaretOffset } from "./richComposerHelpers";

const SLASH_COMMANDS: RichComposerSlashCommand[] = [
  {
    id: "skill:brainstorm",
    category: "skill",
    title: "/brainstorm",
    description: "Explore ideas before implementation.",
  },
  {
    id: "agent:claude",
    category: "agent",
    title: "/claude",
    description: "Agent · Claude",
  },
];

let scrollIntoViewMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoViewMock = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock,
  });
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent ?? "";
    },
    set(value: string) {
      this.textContent = value;
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("RichComposer", () => {
  it("shows the focus shortcut hint only while the composer is unfocused", () => {
    render(<RichComposer placeholder="Type a message…" focusShortcutHint="⌘ + L to focus" />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    expect(screen.getByText(/L to focus/)).toBeTruthy();

    fireEvent.focus(textbox);
    expect(screen.queryByText(/L to focus/)).toBeNull();

    fireEvent.blur(textbox);
    expect(screen.getByText(/L to focus/)).toBeTruthy();
  });

  it("does not accept input while disabled", () => {
    const onChange = vi.fn();
    render(<RichComposer placeholder="Type a message…" disabled onChange={onChange} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "draft";
    fireEvent.input(textbox);

    expect(textbox.getAttribute("contenteditable")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the cursor to the end after dropping a file path", () => {
    const droppedPath = "/tmp/report.md";

    function ControlledComposer() {
      const [value, setValue] = useState<string | undefined>();
      return <RichComposer placeholder="Type a message…" value={value} onChange={setValue} />;
    }

    render(<ControlledComposer />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    const composerText = `Before ${droppedPath}`;
    textbox.innerHTML = renderComposerHtml(composerText);
    Object.defineProperty(textbox, "innerText", { configurable: true, value: composerText, writable: true });
    textbox.focus();
    setCaretOffset(textbox, 0);
    fireEvent.input(textbox, { inputType: "insertFromDrop" });

    expect(document.activeElement).toBe(textbox);
    expect(getCaretOffset(textbox)).toBe(composerText.length);
  });

  it("shows slash commands after typing slash", () => {
    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/";
    fireEvent.input(textbox);

    expect(screen.getByRole("button", { name: "/brainstorm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "/claude" })).toBeTruthy();
  });

  it("does not match slash commands by description text", () => {
    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/ideas";
    fireEvent.input(textbox);

    expect(screen.getByText("No matching commands")).toBeTruthy();
  });

  it("selects the first slash command by default when pressing Enter", () => {
    const onChange = vi.fn();

    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} onChange={onChange} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/";
    fireEvent.input(textbox);
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(textbox.textContent).toBe("/brainstorm ");
    expect(onChange).toHaveBeenLastCalledWith("/brainstorm ");
  });

  it("supports up/down keys to change the selected slash command with looping", () => {
    const onChange = vi.fn();

    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} onChange={onChange} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/";
    fireEvent.input(textbox);
    fireEvent.keyDown(textbox, { key: "ArrowUp" });
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(textbox.textContent).toBe("/claude ");
    expect(onChange).toHaveBeenLastCalledWith("/claude ");
  });

  it("wraps from the last slash command back to the first on ArrowDown", () => {
    const onChange = vi.fn();

    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} onChange={onChange} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/";
    fireEvent.input(textbox);
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(textbox.textContent).toBe("/brainstorm ");
    expect(onChange).toHaveBeenLastCalledWith("/brainstorm ");
  });

  it("scrolls the selected slash command into view when using arrow keys", () => {
    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/";
    fireEvent.input(textbox);
    scrollIntoViewMock.mockClear();

    fireEvent.keyDown(textbox, { key: "ArrowDown" });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("supports Tab to insert the currently selected slash command", () => {
    const onChange = vi.fn();

    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} onChange={onChange} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/";
    fireEvent.input(textbox);
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "Tab" });

    expect(textbox.textContent).toBe("/claude ");
    expect(onChange).toHaveBeenLastCalledWith("/claude ");
  });

  it("renders inserted skills with the skill slash token class", () => {
    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/br";
    fireEvent.input(textbox);
    fireEvent.click(screen.getByRole("button", { name: "/brainstorm" }));

    expect(textbox.querySelector(".composer-slash-skill")?.textContent).toBe("/brainstorm");
  });

  it("renders inserted agents with the agent slash token class", () => {
    render(<RichComposer placeholder="Type a message…" slashCommands={SLASH_COMMANDS} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "/cl";
    fireEvent.input(textbox);
    fireEvent.click(screen.getByRole("button", { name: "/claude" }));

    expect(textbox.querySelector(".composer-slash-agent")?.textContent).toBe("/claude");
  });

  it("calls onFilesDrop and suppresses native insertion when a file-tree file is dropped", async () => {
    const onFilesDrop = vi.fn();
    render(<RichComposer placeholder="Type a message…" onFilesDrop={onFilesDrop} />);
    const textbox = screen.getByRole("textbox", { name: "Type a message…" });

    const dt = {
      types: [FILETREE_DRAG_MIME],
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
      getData: (type: string) =>
        type === FILETREE_DRAG_MIME ? JSON.stringify([{ path: "/workspace/src/foo.ts", isDirectory: false }]) : "",
      setData: () => {},
      clearData: () => {},
      dropEffect: "none" as DataTransfer["dropEffect"],
      effectAllowed: "all" as DataTransfer["effectAllowed"],
    } as unknown as DataTransfer;

    // dragenter to activate drag-over state
    const enterEvent = createEvent.dragEnter(textbox);
    Object.defineProperty(enterEvent, "dataTransfer", { value: dt });
    fireEvent(textbox, enterEvent);

    // drop with the filetree payload
    const dropEvent = createEvent.drop(textbox);
    Object.defineProperty(dropEvent, "dataTransfer", { value: dt });
    await act(async () => {
      fireEvent(textbox, dropEvent);
    });

    expect(onFilesDrop).toHaveBeenCalledWith([{ path: "/workspace/src/foo.ts", isDirectory: false }]);
    // native insertion would have set textContent — it must not
    expect(textbox.textContent).toBe("");
  });

  it("calls onPasteBlock for multi-line paste and does not insert text inline", () => {
    const onPasteBlock = vi.fn();
    render(<RichComposer placeholder="Type a message…" onPasteBlock={onPasteBlock} />);
    const textbox = screen.getByRole("textbox", { name: "Type a message…" });

    const multiLineText = "line one\nline two\nline three";
    fireEvent.paste(textbox, {
      clipboardData: { getData: () => multiLineText },
    });

    expect(onPasteBlock).toHaveBeenCalledWith(multiLineText);
    expect(textbox.textContent).toBe("");
  });

  it("inserts single-line paste inline and does not call onPasteBlock", () => {
    const onPasteBlock = vi.fn();
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn() });
    render(<RichComposer placeholder="Type a message…" onPasteBlock={onPasteBlock} />);
    const textbox = screen.getByRole("textbox", { name: "Type a message…" });

    fireEvent.paste(textbox, {
      clipboardData: { getData: () => "just one line" },
    });

    expect(onPasteBlock).not.toHaveBeenCalled();
  });
});
