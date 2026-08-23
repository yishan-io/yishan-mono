// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LOCAL_TASK_TAGS } from "../../localTaskTags";
import { LocalTaskTagsEditor } from "./LocalTaskTagsEditor";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, start: index * 36, size: 36 })),
    scrollToIndex: vi.fn(),
  }),
}));

describe("LocalTaskTagsEditor", () => {
  afterEach(cleanup);

  it("removes a tag with one update containing the remaining tags", async () => {
    const onTagsChange = vi.fn(async () => undefined);
    render(<LocalTaskTagsEditor tags={["first", "second"]} suggestions={[]} onTagsChange={onTagsChange} />);

    const [deleteTag] = screen.getAllByLabelText("localTask.tags.delete");
    if (!deleteTag) throw new Error("Expected a tag delete control");
    fireEvent.click(deleteTag);

    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith(["second"]));
  });

  it("opens the add dialog and adds a batch of tags with one update", async () => {
    const onTagsChange = vi.fn(async () => undefined);
    render(<LocalTaskTagsEditor tags={["existing"]} suggestions={[]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("combobox", { name: "localTask.tags.addInput" });
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.add" }));

    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith(["existing", "first", "second"]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open and shows a mutation error", async () => {
    const onTagsChange = vi.fn(async () => Promise.reject(new Error("Update failed")));
    render(<LocalTaskTagsEditor tags={[]} suggestions={[]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("combobox", { name: "localTask.tags.addInput" });
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.add" }));

    expect(await screen.findByText("Update failed")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each([
    ["duplicate", ["existing"], "EXISTING"],
    ["maximum count", Array.from({ length: MAX_LOCAL_TASK_TAGS }, (_, index) => `tag-${index}`), "extra"],
  ])("does not update for invalid %s additions", async (_name, tags, addition) => {
    const onTagsChange = vi.fn(async () => undefined);
    render(<LocalTaskTagsEditor tags={tags} suggestions={[]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    const input = screen.getByRole("combobox", { name: "localTask.tags.addInput" });
    fireEvent.change(input, { target: { value: addition } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect((screen.getByRole("button", { name: "localTask.actions.add" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it("disables tag controls and the dialog form while a mutation is pending", () => {
    const { rerender } = render(
      <LocalTaskTagsEditor tags={["existing"]} suggestions={[]} onTagsChange={vi.fn()} isMutationLoading={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.add" }));
    rerender(<LocalTaskTagsEditor tags={["existing"]} suggestions={[]} onTagsChange={vi.fn()} isMutationLoading />);

    const [deleteTag] = screen.getAllByLabelText("localTask.tags.delete");
    if (!deleteTag) throw new Error("Expected a tag delete control");
    expect(deleteTag.closest(".MuiChip-root")?.className).toContain("Mui-disabled");
    expect(
      (screen.getByRole("button", { name: "localTask.tags.add", hidden: true }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("combobox", { name: "localTask.tags.addInput" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "common.actions.cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
