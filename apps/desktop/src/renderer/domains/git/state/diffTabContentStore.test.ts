import { afterEach, describe, expect, it } from "vitest";
import { diffTabContentStore } from "./diffTabContentStore";

const initialState = diffTabContentStore.getState();

afterEach(() => {
  diffTabContentStore.setState(initialState, true);
});

describe("diffTabContentStore", () => {
  it("seeds diff content and multi-file entries", () => {
    diffTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", oldContent: "old", newContent: "new" });

    expect(diffTabContentStore.getState().byTabId["tab-1"]).toMatchObject({
      path: "src/a.ts",
      oldContent: "old",
      newContent: "new",
    });
  });

  it("updates diff content in place", () => {
    diffTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", oldContent: "old", newContent: "new" });

    diffTabContentStore.getState().update("tab-1", { oldContent: "old-next", newContent: "new-next" });

    expect(diffTabContentStore.getState().byTabId["tab-1"]).toMatchObject({
      oldContent: "old-next",
      newContent: "new-next",
    });
  });

  it("removes tab data when tabs close", () => {
    diffTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", oldContent: "old", newContent: "new" });
    diffTabContentStore.getState().seed({ tabId: "tab-2", path: "src/b.ts", oldContent: "old", newContent: "new" });

    diffTabContentStore.getState().removeTabData(["tab-1"]);

    expect(diffTabContentStore.getState().byTabId["tab-1"]).toBeUndefined();
    expect(diffTabContentStore.getState().byTabId["tab-2"]).toBeDefined();
  });
});
