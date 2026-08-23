// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

    fireEvent.mouseDown(input);
    expect(screen.getByText("Tag 0")).toBeTruthy();
    expect(screen.queryByText("Tag 59")).toBeNull();

    render(<LocalTaskTagsInput tags={["duplicate", "Duplicate"]} suggestions={[]} onChange={onChange} />);
    expect(screen.getByText("Tags must be unique.")).toBeTruthy();
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
});
