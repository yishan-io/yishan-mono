// @vitest-environment jsdom

import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FILETREE_DRAG_MIME } from "./FileTree/dataTransfer";
import { RichComposer, type RichComposerSlashCommand } from "./RichComposer";
import { getCaretOffset, renderComposerHtml, setCaretOffset } from "./richComposerHelpers";
import type { FileMentionResult } from "./richComposerTypes";

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

  it("clears the draft after a successful Enter submit", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<RichComposer placeholder="Type a message…" onSubmit={onSubmit} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "hello";
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("hello"));
    await waitFor(() => expect(textbox.textContent).toBe(""));
  });

  it("keeps the draft when the submit reports failure (resolved false)", async () => {
    const onSubmit = vi.fn(async () => false);
    render(<RichComposer placeholder="Type a message…" onSubmit={onSubmit} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "hello";
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("hello"));
    expect(textbox.textContent).toBe("hello");
  });

  it("keeps the draft when the submit rejects", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("pi session not found");
    });
    render(<RichComposer placeholder="Type a message…" onSubmit={onSubmit} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "hello";
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("hello"));
    expect(textbox.textContent).toBe("hello");
  });

  it("ignores Enter while a submit is in flight (no double send)", async () => {
    let resolveSubmit: ((value: unknown) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<RichComposer placeholder="Type a message…" onSubmit={onSubmit} />);

    const textbox = screen.getByRole("textbox", { name: "Type a message…" });
    textbox.innerText = "hello";
    fireEvent.keyDown(textbox, { key: "Enter" });
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolveSubmit?.(undefined);
    await waitFor(() => expect(textbox.textContent).toBe(""));
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

  describe("file mention menu", () => {
    const MENTION_FILES = [
      { path: "src/renderer/App.tsx", highlightedPathIndexes: [] },
      { path: "src/renderer/main.tsx", highlightedPathIndexes: [] },
      { path: "docs/coding-guide.md", highlightedPathIndexes: [] },
    ];

    function mockFileMentionSearch(query: string) {
      return Promise.resolve(MENTION_FILES.filter((result) => result.path.toLowerCase().includes(query.toLowerCase())));
    }

    it("shows file results after typing @ and searches with the typed query", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@main";
      fireEvent.input(textbox);

      expect(await screen.findByRole("button", { name: "src/renderer/main.tsx" })).toBeTruthy();
      expect(fileMentionSearch).toHaveBeenCalledWith("main");
    });

    it("does not open the mention menu when no provider is wired", () => {
      render(<RichComposer placeholder="Type a message…" />);

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@main";
      fireEvent.input(textbox);

      expect(screen.queryByRole("button", { name: "src/renderer/main.tsx" })).toBeNull();
    });

    it("selects a file with ArrowDown and inserts it on Enter, removing the @ token", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();
      const onChange = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          onChange={onChange}
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "see @src";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/App.tsx" });

      fireEvent.keyDown(textbox, { key: "ArrowDown" });
      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onMentionFile).toHaveBeenCalledWith("src/renderer/main.tsx", false);
      expect(textbox.textContent).toBe("see ");
      expect(onChange).toHaveBeenLastCalledWith("see ");
    });

    it("wraps selection from the last result back to the first on ArrowDown", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/App.tsx" });

      fireEvent.keyDown(textbox, { key: "ArrowDown" });
      fireEvent.keyDown(textbox, { key: "ArrowDown" });
      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onMentionFile).toHaveBeenCalledWith("src/renderer/App.tsx", false);
    });

    it("inserts the selected file with Tab", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@docs";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "docs/coding-guide.md" });

      fireEvent.keyDown(textbox, { key: "Tab" });

      expect(onMentionFile).toHaveBeenCalledWith("docs/coding-guide.md", false);
      expect(textbox.textContent).toBe("");
    });

    it("closes the mention menu on Escape without inserting", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/App.tsx" });

      fireEvent.keyDown(textbox, { key: "Escape" });
      // The keyup must not re-sync the menu and reopen it (caret is still inside the token).
      fireEvent.keyUp(textbox, { key: "Escape" });

      expect(screen.queryByRole("button", { name: "src/renderer/App.tsx" })).toBeNull();
      // The menu must be fully dismissed, not merely re-searching with no rows yet.
      expect(screen.queryByText("Searching files…")).toBeNull();
      expect(onMentionFile).not.toHaveBeenCalled();
      expect(textbox.textContent).toBe("@src");
    });

    it("shows the empty state when no files match", async () => {
      const fileMentionSearch = vi.fn(async () => []);

      render(
        <RichComposer placeholder="Type a message…" fileMentionSearch={fileMentionSearch} onMentionFile={vi.fn()} />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@zzz";
      fireEvent.input(textbox);

      expect(await screen.findByText("No matching files")).toBeTruthy();
    });

    it("shows the failed state when the file search fails", async () => {
      const fileMentionSearch = vi.fn(async () => {
        throw new Error("daemon unavailable");
      });

      render(
        <RichComposer placeholder="Type a message…" fileMentionSearch={fileMentionSearch} onMentionFile={vi.fn()} />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);

      expect(await screen.findByText("Search failed")).toBeTruthy();
    });

    it("does not search on a bare @ token", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);

      render(
        <RichComposer placeholder="Type a message…" fileMentionSearch={fileMentionSearch} onMentionFile={vi.fn()} />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@";
      fireEvent.input(textbox);

      expect(await screen.findByText("No matching files")).toBeTruthy();
      expect(fileMentionSearch).not.toHaveBeenCalled();
    });

    it("inserts the full token when the caret is mid-token", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "see @main.tsx";
      setCaretOffset(textbox, 9);
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/main.tsx" });

      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onMentionFile).toHaveBeenCalledWith("src/renderer/main.tsx", false);
      expect(textbox.textContent).toBe("see ");
    });

    it("closes the mention menu and submits when Enter is pressed with no results", async () => {
      const onSubmit = vi.fn();
      const fileMentionSearch = vi.fn(async () => []);

      render(
        <RichComposer
          placeholder="Type a message…"
          onSubmit={onSubmit}
          fileMentionSearch={fileMentionSearch}
          onMentionFile={vi.fn()}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@zzz";
      fireEvent.input(textbox);
      await screen.findByText("No matching files");

      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onSubmit).toHaveBeenCalledWith("@zzz");
      expect(screen.queryByText("No matching files")).toBeNull();
    });

    it("does not submit when Enter is pressed after the search failed", async () => {
      const onSubmit = vi.fn();
      const fileMentionSearch = vi.fn(async () => {
        throw new Error("daemon unavailable");
      });

      render(
        <RichComposer
          placeholder="Type a message…"
          onSubmit={onSubmit}
          fileMentionSearch={fileMentionSearch}
          onMentionFile={vi.fn()}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);
      await screen.findByText("Search failed");

      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(textbox.textContent).toBe("@src");
    });

    it("does not submit while mention results are still loading", async () => {
      const onSubmit = vi.fn();
      const fileMentionSearch = vi.fn(() => new Promise<FileMentionResult[]>(() => {}));

      render(
        <RichComposer
          placeholder="Type a message…"
          onSubmit={onSubmit}
          fileMentionSearch={fileMentionSearch}
          onMentionFile={vi.fn()}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);
      await screen.findByText("Searching files…");

      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(textbox.textContent).toBe("@src");
    });

    it("shows the searching state while results are pending", async () => {
      const fileMentionSearch = vi.fn(() => new Promise<FileMentionResult[]>(() => {}));

      render(
        <RichComposer placeholder="Type a message…" fileMentionSearch={fileMentionSearch} onMentionFile={vi.fn()} />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);

      expect(await screen.findByText("Searching files…")).toBeTruthy();
    });

    it("clears stale results while a new query is in flight", async () => {
      const fileMentionSearch = vi.fn((query: string) => {
        if (query === "main") {
          return Promise.resolve([{ path: "src/renderer/main.tsx", highlightedPathIndexes: [] }]);
        }
        return new Promise<FileMentionResult[]>(() => {});
      });

      render(
        <RichComposer placeholder="Type a message…" fileMentionSearch={fileMentionSearch} onMentionFile={vi.fn()} />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@main";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/main.tsx" });

      textbox.innerText = "@mainx";
      setCaretOffset(textbox, textbox.innerText.length);
      fireEvent.input(textbox);

      expect(await screen.findByText("Searching files…")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "src/renderer/main.tsx" })).toBeNull();
    });

    it("wraps ArrowUp from the first result to the last", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/App.tsx" });

      fireEvent.keyDown(textbox, { key: "ArrowUp" });
      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onMentionFile).toHaveBeenCalledWith("src/renderer/main.tsx", false);
    });

    it("clamps the selection when results shrink", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/App.tsx" });
      fireEvent.keyDown(textbox, { key: "ArrowDown" });

      textbox.innerText = "@main";
      setCaretOffset(textbox, textbox.innerText.length);
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/main.tsx" });

      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onMentionFile).toHaveBeenCalledWith("src/renderer/main.tsx", false);
    });

    it("closes the mention menu when the @ token is removed", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);

      render(
        <RichComposer placeholder="Type a message…" fileMentionSearch={fileMentionSearch} onMentionFile={vi.fn()} />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@main";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/renderer/main.tsx" });

      textbox.innerText = "main";
      fireEvent.keyUp(textbox, { key: "Backspace" });

      expect(screen.queryByRole("button", { name: "src/renderer/main.tsx" })).toBeNull();
    });

    it("inserts the mentioned file when a result is clicked", async () => {
      const fileMentionSearch = vi.fn(mockFileMentionSearch);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@docs";
      fireEvent.input(textbox);

      fireEvent.click(await screen.findByRole("button", { name: "docs/coding-guide.md" }));

      expect(onMentionFile).toHaveBeenCalledWith("docs/coding-guide.md", false);
      expect(textbox.textContent).toBe("");
    });

    it("inserts a folder mention with isDirectory true", async () => {
      const fileMentionSearch = vi.fn(async () => [
        { path: "src/components", highlightedPathIndexes: [0, 1, 2], isDirectory: true },
      ]);
      const onMentionFile = vi.fn();

      render(
        <RichComposer
          placeholder="Type a message…"
          fileMentionSearch={fileMentionSearch}
          onMentionFile={onMentionFile}
        />,
      );

      const textbox = screen.getByRole("textbox", { name: "Type a message…" });
      textbox.innerText = "@src/comp";
      fireEvent.input(textbox);
      await screen.findByRole("button", { name: "src/components" });

      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onMentionFile).toHaveBeenCalledWith("src/components", true);
      expect(textbox.textContent).toBe("");
    });
  });
});
