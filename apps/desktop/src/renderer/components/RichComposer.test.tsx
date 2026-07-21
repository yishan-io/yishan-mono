// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichComposer, type RichComposerSlashCommand } from "./RichComposer";

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
});
