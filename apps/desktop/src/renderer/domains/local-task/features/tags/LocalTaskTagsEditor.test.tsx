// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalTaskTagsEditor } from "./LocalTaskTagsEditor";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const scrollToIndex = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, start: index * 36, size: 36 })),
    scrollToIndex,
  }),
}));

describe("LocalTaskTagsEditor", () => {
  afterEach(cleanup);

  it("opens the selector with existing selections when a displayed tag is clicked and has no delete affordance", () => {
    render(
      <LocalTaskTagsEditor
        tags={["first", "second"]}
        suggestions={["first", "second", "third"]}
        onTagsChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("localTask.tags.delete")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "first" }));

    expect(screen.getByRole("textbox", { name: "localTask.tags.addInput" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "first" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "second" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "third" }).getAttribute("aria-selected")).toBe("false");
  });

  it("opens an anchored selector popover with its input focused, not a dialog", async () => {
    render(<LocalTaskTagsEditor tags={["existing"]} suggestions={["existing", "first"]} onTagsChange={vi.fn()} />);

    const addButton = screen.getByRole("button", { name: "localTask.tags.add" });
    fireEvent.click(addButton);

    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(screen.getByRole("option", { name: /first/i })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "localTask.tags.addInput" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses a compact placeholder-only search input while preserving its accessible name", () => {
    render(<LocalTaskTagsEditor tags={[]} suggestions={["backend"]} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));

    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    const inputRoot = input.closest(".MuiInputBase-root");
    if (!inputRoot) throw new Error("Expected a MUI input root");
    const inputRootClass = Array.from(inputRoot.classList).find((className) => className.startsWith("css-"));
    const compactInputRule = Array.from(document.styleSheets)
      .flatMap((styleSheet) => Array.from(styleSheet.cssRules).map((rule) => rule.cssText))
      .find((cssText) => inputRootClass && cssText.includes(`.${inputRootClass} .MuiInputBase-input`));

    expect(input.getAttribute("placeholder")).toBe("localTask.tags.addInput");
    expect(document.querySelector(`label[for="${input.id}"]`)).toBeNull();
    expect(getComputedStyle(inputRoot).minHeight).toBe("28px");
    expect(compactInputRule).toContain("padding-top: 4px");
    expect(compactInputRule).toContain("padding-bottom: 4px");
    expect(compactInputRule).toContain("font-size: 13px");
    expect(screen.getByRole("listbox", { name: "localTask.tags.addInput" })).toBeTruthy();
  });

  it("uses a plain search input with a bounded scrolling tag list", () => {
    render(<LocalTaskTagsEditor tags={["selected"]} suggestions={["backend", "frontend"]} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    expect(screen.queryByRole("combobox", { name: "localTask.tags.addInput" })).toBeNull();
    expect(input.closest(".MuiChip-root")).toBeNull();
    expect(document.querySelector(".MuiPopover-paper .MuiChip-root")).toBeNull();
    expect(screen.getByRole("option", { name: /selected/i }).getAttribute("aria-selected")).toBe("true");

    fireEvent.change(input, { target: { value: "back" } });
    expect(screen.getByRole("option", { name: /backend/i })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /frontend/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /selected/i })).toBeNull();

    const list = screen.getByRole("listbox", { name: "localTask.tags.addInput" });
    const scrollList = list.parentElement;
    const paper = list.closest(".MuiPopover-paper");
    expect(list.getAttribute("aria-multiselectable")).toBe("true");
    expect(getComputedStyle(paper as Element).height).toBe("320px");
    expect(getComputedStyle(scrollList as Element).flexGrow).toBe("1");
    expect(getComputedStyle(scrollList as Element).overflowY).toBe("auto");
  });

  it("scrolls the active option into the tag list view during keyboard navigation", () => {
    const suggestions = Array.from({ length: 10 }, (_, index) => `tag-${index}`);
    render(<LocalTaskTagsEditor tags={[]} suggestions={suggestions} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(input.getAttribute("aria-activedescendant")).toMatch(/-listbox-option-9$/);
    expect(scrollToIndex).toHaveBeenCalledWith(9, { align: "auto" });
  });

  it("keeps the selector open and moves focus to add after deselecting its sole chip anchor", async () => {
    function StatefulTagsEditor() {
      const [tags, setTags] = useState(["sole"]);
      return (
        <LocalTaskTagsEditor tags={tags} suggestions={["sole"]} onTagsChange={async (nextTags) => setTags(nextTags)} />
      );
    }

    render(<StatefulTagsEditor />);

    const addButton = screen.getByRole("button", { name: "localTask.tags.add" });
    fireEvent.click(screen.getByRole("button", { name: "sole" }));
    fireEvent.click(screen.getByRole("option", { name: "sole" }));

    await waitFor(() => expect(document.activeElement).toBe(addButton));
    expect(screen.getByRole("textbox", { name: "localTask.tags.addInput" })).toBeTruthy();
  });

  it("closes the selector when its removed chip anchor has no connected add control", async () => {
    function StatefulTagsEditor() {
      const [tags, setTags] = useState(["sole"]);
      return (
        <LocalTaskTagsEditor tags={tags} suggestions={["sole"]} onTagsChange={async (nextTags) => setTags(nextTags)} />
      );
    }

    render(<StatefulTagsEditor />);

    const addButton = screen.getByRole("button", { name: "localTask.tags.add" });
    fireEvent.click(screen.getByRole("button", { name: "sole" }));
    addButton.remove();
    fireEvent.click(screen.getByRole("option", { name: "sole" }));

    await waitFor(() => expect(screen.queryByRole("textbox", { name: "localTask.tags.addInput" })).toBeNull());
  });

  it("immediately adds and removes tag selections", async () => {
    const onTagsChange = vi.fn(async () => undefined);
    render(<LocalTaskTagsEditor tags={["existing"]} suggestions={["existing", "first"]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    fireEvent.click(screen.getByRole("option", { name: /first/i }));
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith(["existing", "first"]));

    fireEvent.click(screen.getByRole("option", { name: /existing/i }));
    await waitFor(() => expect(onTagsChange).toHaveBeenLastCalledWith(["first"]));
    expect(screen.queryByRole("button", { name: "localTask.actions.add" })).toBeNull();
    expect(screen.queryByRole("button", { name: "common.actions.cancel" })).toBeNull();
  });

  it("restores the previous selection and shows the mutation error in the popover", async () => {
    const onTagsChange = vi.fn(async () => Promise.reject(new Error("Update failed")));
    render(<LocalTaskTagsEditor tags={[]} suggestions={["first"]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    fireEvent.click(screen.getByRole("option", { name: /first/i }));

    expect(await screen.findByText("Update failed")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /first/i }).getAttribute("aria-selected")).toBe("false"),
    );
  });

  it("closes the selector on click-away and Escape when no mutation is pending", async () => {
    render(<LocalTaskTagsEditor tags={[]} suggestions={["first"]} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    expect(screen.getByRole("textbox", { name: "localTask.tags.addInput" })).toBeTruthy();
    const backdrop = document.querySelector(".MuiPopover-root .MuiBackdrop-root");
    if (!backdrop) throw new Error("Expected a popover backdrop");
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "localTask.tags.addInput" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "localTask.tags.addInput" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "localTask.tags.addInput" })).toBeNull());
  });

  it.each(["Escape", "click-away"])(
    "dismisses the selector during a pending mutation with %s and shows its error",
    async (dismissal) => {
      let rejectMutation: (error: Error) => void = () => undefined;
      const onTagsChange = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectMutation = reject;
          }),
      );
      render(<LocalTaskTagsEditor tags={[]} suggestions={["first"]} onTagsChange={onTagsChange} />);

      fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
      fireEvent.click(screen.getByRole("option", { name: /first/i }));
      await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith(["first"]));

      if (dismissal === "Escape") {
        fireEvent.keyDown(screen.getByRole("textbox", { name: "localTask.tags.addInput" }), { key: "Escape" });
      } else {
        const backdrop = document.querySelector(".MuiPopover-root .MuiBackdrop-root");
        if (!backdrop) throw new Error("Expected a popover backdrop");
        fireEvent.click(backdrop);
      }
      await waitFor(() => expect(screen.queryByRole("combobox", { name: "localTask.tags.addInput" })).toBeNull());

      rejectMutation(new Error("Update failed after close"));
      expect(await screen.findByText("Update failed after close")).toBeTruthy();
    },
  );

  it("closes the automatic color picker and restores selection when a new tag mutation is rejected", async () => {
    const onTagsChange = vi.fn(async () => Promise.reject(new Error("New tag rejected")));
    render(<LocalTaskTagsEditor tags={[]} suggestions={[]} onTagsChange={onTagsChange} onTagColorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    fireEvent.change(input, { target: { value: "new tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("group", { name: "localTask.tags.colorPicker" })).toBeTruthy();
    expect(await screen.findByText("New tag rejected")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("group", { name: "localTask.tags.colorPicker" })).toBeNull());
    expect(screen.queryByText("new tag")).toBeNull();
  });

  it("keeps the selector input focused while a mutation is pending and accepts another keyboard selection afterward", async () => {
    let resolveMutation: () => void = () => undefined;
    const onTagsChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    render(<LocalTaskTagsEditor tags={[]} suggestions={["first", "second"]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith(["first"]));

    expect((input as HTMLInputElement).disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onTagsChange).toHaveBeenCalledTimes(1);

    resolveMutation();
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onTagsChange).toHaveBeenLastCalledWith(["first", "second"]));
  });

  it("virtualizes more than fifty tag suggestions", () => {
    const suggestions = Array.from({ length: 51 }, (_, index) => `tag-${index}`);
    render(<LocalTaskTagsEditor tags={[]} suggestions={suggestions} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));

    expect(screen.getAllByRole("option")).toHaveLength(8);
  });

  it("opens the immediate color picker after Enter adds an unassigned tag", async () => {
    const onTagsChange = vi.fn(async () => undefined);
    const onTagColorChange = vi.fn(async () => undefined);
    render(
      <LocalTaskTagsEditor
        tags={[]}
        suggestions={[]}
        onTagsChange={onTagsChange}
        onTagColorChange={onTagColorChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("textbox", { name: "localTask.tags.addInput" });
    fireEvent.change(input, { target: { value: "new tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith(["new tag"]));
    expect(screen.getByRole("group", { name: "localTask.tags.colorPicker" })).toBeTruthy();
  });
});
