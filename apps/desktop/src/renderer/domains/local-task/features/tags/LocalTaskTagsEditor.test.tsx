// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalTaskTagsEditor } from "./LocalTaskTagsEditor";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 36, size: 36 })),
    scrollToIndex: vi.fn(),
  }),
}));

const catalog = [
  {
    id: "tag-backend",
    key: "backend",
    name: "Backend",
    aliases: ["Backend", "backend"],
    color: null,
  },
];

describe("LocalTaskTagsEditor", () => {
  afterEach(cleanup);

  it("updates stable tag IDs", async () => {
    const onTagIdsChange = vi.fn(async () => undefined);
    render(
      <LocalTaskTagsEditor
        tagRefs={[{ id: "tag-backend", name: "Backend" }]}
        tagCatalog={catalog}
        onTagIdsChange={onTagIdsChange}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));
    await waitFor(() => expect(onTagIdsChange).toHaveBeenCalledWith([]));
  });

  it("shows update failures", async () => {
    render(
      <LocalTaskTagsEditor
        tagRefs={[]}
        tagCatalog={catalog}
        onTagIdsChange={async () => Promise.reject(new Error("update failed"))}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));
    expect(await screen.findByText("update failed")).toBeTruthy();
  });

  it("retains explicit legacy compatibility without creating a pseudo-ID", () => {
    render(<LocalTaskTagsEditor tags={["missing"]} tagCatalog={catalog} onTagsChange={vi.fn()} />);
    expect(screen.getByText("missing")).toBeTruthy();
    expect(screen.getByText("localTask.tags.unresolvedLegacy")).toBeTruthy();
  });
});
