// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { LocalTaskTagsInput } from "./LocalTaskTagsInput";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 36, size: 36 })),
    scrollToIndex: vi.fn(),
  }),
}));

const backendTag: LocalTaskTagCatalogEntry = {
  id: "tag-backend",
  key: "backend",
  name: "Backend",
  aliases: ["Backend", "backend"],
  color: null,
};
const catalog = [backendTag];

describe("LocalTaskTagsInput", () => {
  afterEach(cleanup);

  it("selects catalog IDs", async () => {
    const onChange = vi.fn();
    render(<LocalTaskTagsInput tagIds={["tag-backend"]} tagCatalog={catalog} onChange={onChange} />);

    expect(screen.getByText("Backend")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });

  it("sorts selected tags first and hides unchecked checkboxes until hover", () => {
    const unselectedTag: LocalTaskTagCatalogEntry = {
      id: "tag-frontend",
      key: "frontend",
      name: "Frontend",
      aliases: [],
      color: null,
    };
    render(<LocalTaskTagsInput tagIds={["tag-backend"]} tagCatalog={[unselectedTag, backendTag]} onChange={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Backend", "Frontend"]);
    expect(getComputedStyle(options[0]?.querySelector("[data-local-task-tag-checkbox]") as Element).opacity).toBe("1");
    expect(getComputedStyle(options[1]?.querySelector("[data-local-task-tag-checkbox]") as Element).opacity).toBe("0");

    const styleRules = Array.from(document.styleSheets)
      .flatMap((styleSheet) => Array.from(styleSheet.cssRules).map((rule) => rule.cssText))
      .join("\n");
    expect(styleRules).toContain("[data-local-task-tag-option]:hover");
  });

  it("keeps the dropdown open after selecting a tag", () => {
    render(<LocalTaskTagsInput tagIds={[]} tagCatalog={catalog} onChange={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));

    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("creates a free-solo tag before emitting its catalog ID", async () => {
    const onChange = vi.fn();
    const onCreateTag = vi.fn(
      async (): Promise<LocalTaskTagCatalogEntry> => ({ ...backendTag, id: "tag-new", key: "new", name: "New" }),
    );
    render(<LocalTaskTagsInput tagIds={[]} tagCatalog={catalog} onChange={onChange} onCreateTag={onCreateTag} />);

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith("New"));
    expect(onChange).toHaveBeenCalledWith(["tag-new"]);
  });

  it("shows an error and does not emit a selection when catalog creation rejects", async () => {
    const onChange = vi.fn();
    const onCreateTag = vi.fn(async () => Promise.reject(new Error("catalog unavailable")));
    render(<LocalTaskTagsInput tagIds={[]} tagCatalog={catalog} onChange={onChange} onCreateTag={onCreateTag} />);

    const input = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("catalog unavailable")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resolves a named legacy tag through catalog aliases", () => {
    render(<LocalTaskTagsInput tags={["backend"]} tagCatalog={catalog} onChange={vi.fn()} />);
    expect(screen.getByText("Backend")).toBeTruthy();
    expect(screen.queryByText("localTask.tags.unresolvedLegacy")).toBeNull();
  });

  it("renders selected chips without a delete control because selection changes in the popover", () => {
    render(<LocalTaskTagsInput tagIds={["tag-backend"]} tagCatalog={catalog} onChange={vi.fn()} />);

    const chip = screen.getByText("Backend").closest(".MuiChip-root");
    expect(chip?.querySelector(".MuiChip-deleteIcon")).toBeNull();
    expect(chip?.querySelector('[aria-label*="delete" i]')).toBeNull();
  });

  it("keeps an unresolved named legacy tag visible and disables editing", () => {
    render(<LocalTaskTagsInput tags={["retired-name"]} tagCatalog={catalog} onChange={vi.fn()} />);
    expect(screen.getByText("retired-name")).toBeTruthy();
    expect(screen.getByText("localTask.tags.unresolvedLegacy")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "localTask.fields.tags" }) as HTMLInputElement).disabled).toBe(true);
  });
});
