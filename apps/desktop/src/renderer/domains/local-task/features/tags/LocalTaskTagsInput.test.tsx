// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LOCAL_TASK_TAGS, MAX_LOCAL_TASK_TAG_CODE_POINTS } from "../../localTaskTags";
import { LocalTaskTagsInput } from "./LocalTaskTagsInput";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, start: index * 36, size: 36 })),
    scrollToIndex: vi.fn(),
  }),
}));

describe("LocalTaskTagsInput", () => {
  afterEach(cleanup);
  it("normalizes created tags, reports validation errors, and virtualizes more than fifty suggestions", () => {
    const onChange = vi.fn();
    const suggestions = Array.from({ length: 60 }, (_, index) => `Tag ${index}`);
    render(<LocalTaskTagsInput tags={[]} suggestions={suggestions} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: "  Cafe\u0301  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Café"]);
    expect(screen.getByText("Café").closest(".MuiChip-root")?.querySelector("[data-local-task-tag-dot]")).toBeTruthy();

    fireEvent.mouseDown(input);
    expect(screen.getByText("Tag 0")).toBeTruthy();
    expect(screen.queryByText("Tag 59")).toBeNull();

    render(<LocalTaskTagsInput tags={["duplicate", "Duplicate"]} suggestions={[]} onChange={onChange} />);
    expect(screen.getByText("Tags must be unique.")).toBeTruthy();
  });

  it("keeps selected suggestions visible and makes the option the only focus target", () => {
    const onChange = vi.fn();
    render(
      <LocalTaskTagsInput
        tags={["backend"]}
        suggestions={["backend", "frontend"]}
        tagCatalog={[{ key: "backend", name: "backend", aliases: ["backend"], color: "red", customColor: null }]}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.mouseDown(input);
    const option = screen.getByRole("option", { name: /backend/i });
    expect(option.getAttribute("aria-selected")).toBe("true");
    const checkbox = option.querySelector('input[type="checkbox"]');
    expect(checkbox?.getAttribute("tabindex")).toBe("-1");
    expect(checkbox?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("marks a daemon alias-equivalent option selected without client-side case folding", () => {
    const onChange = vi.fn();
    render(
      <LocalTaskTagsInput
        tags={["STRASSE"]}
        suggestions={["Straße"]}
        tagCatalog={[
          { key: "strasse", name: "Straße", aliases: ["STRASSE", "Straße"], color: "purple", customColor: null },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));
    const option = screen.getByRole("option", { name: /straße/i });
    expect(option.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it.each(["Enter", " "])("toggles the active option with Arrow and %s", (key) => {
    const onChange = vi.fn();
    render(<LocalTaskTagsInput tags={[]} suggestions={["backend"]} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.mouseDown(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    if (key === " ") expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key });
    expect(onChange).toHaveBeenCalledWith(["backend"]);
  });

  it("opens the color picker after Enter adds a brand-new valid tag", () => {
    const onChange = vi.fn();
    render(<LocalTaskTagsInput tags={[]} suggestions={["backend"]} onChange={onChange} onTagColorChange={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: "new tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["new tag"]);
    expect(screen.getByRole("group", { name: "localTask.tags.colorPicker" })).toBeTruthy();
  });

  it("uses dots without full-chip color styling for selected tags", () => {
    render(
      <LocalTaskTagsInput
        tags={["backend"]}
        suggestions={[]}
        tagCatalog={[{ key: "backend", name: "backend", aliases: ["backend"], color: "purple", customColor: null }]}
        onChange={vi.fn()}
      />,
    );

    const chip = screen.getByText("backend").closest(".MuiChip-root");
    expect(chip?.querySelector("[data-local-task-tag-dot]")).toBeTruthy();
    expect(chip?.querySelector(".MuiChip-icon")).toBeNull();
    expect(chip?.getAttribute("style")).toBeNull();
  });

  it("preserves MUI tag props on custom selected chips", () => {
    render(<LocalTaskTagsInput tags={["selected"]} suggestions={[]} onChange={vi.fn()} />);

    const chip = screen.getByText("selected").closest(".MuiChip-root");
    expect(chip?.getAttribute("tabindex")).toBe("-1");
    expect(chip?.classList.contains("MuiAutocomplete-tag")).toBe(true);
  });

  it("reports invalid visible draft state to its parent", () => {
    const onDraftValidityChange = vi.fn();
    render(
      <LocalTaskTagsInput
        tags={["existing"]}
        suggestions={[]}
        onChange={vi.fn()}
        onDraftValidityChange={onDraftValidityChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: "EXISTING" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onDraftValidityChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ["duplicate", ["existing"], "EXISTING", "Tags must be unique."],
    [
      "thirteenth tag",
      Array.from({ length: MAX_LOCAL_TASK_TAGS }, (_, index) => `tag-${index}`),
      "extra",
      `A task can have at most ${MAX_LOCAL_TASK_TAGS} tags.`,
    ],
    [
      "overlength tag",
      [],
      "a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS + 1),
      `Tags can contain at most ${MAX_LOCAL_TASK_TAG_CODE_POINTS} characters.`,
    ],
  ])("keeps an invalid %s draft local without calling onChange", (_name, tags, invalidTag, expectedError) => {
    const onChange = vi.fn();
    render(<LocalTaskTagsInput tags={tags} suggestions={[]} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: invalidTag } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(expectedError)).toBeTruthy();
    expect(screen.getByText(invalidTag)).toBeTruthy();
  });

  it("persists a custom native picker color for an unassigned new tag", async () => {
    const onTagColorChange = vi.fn(async () => undefined);
    render(<LocalTaskTagsInput tags={[]} suggestions={[]} onChange={vi.fn()} onTagColorChange={onTagColorChange} />);
    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: "new tag" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.customizeColor" }));
    fireEvent.change(screen.getByLabelText("localTask.tags.customColorInput"), { target: { value: "#123456" } });
    await waitFor(() => expect(onTagColorChange).toHaveBeenCalledWith("new tag", null, "#123456"));
  });
});
