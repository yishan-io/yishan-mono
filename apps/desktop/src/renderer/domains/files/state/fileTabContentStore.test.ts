import { afterEach, describe, expect, it } from "vitest";
import { fileTabContentStore } from "./fileTabContentStore";

const initialState = fileTabContentStore.getState();

afterEach(() => {
  fileTabContentStore.setState(initialState, true);
});

describe("fileTabContentStore", () => {
  it("seeds content and tracks saved content", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });

    expect(fileTabContentStore.getState().byTabId["tab-1"]).toMatchObject({
      path: "src/a.ts",
      content: "a1",
      savedContent: "a1",
      isDeleted: false,
      isIgnored: false,
    });
  });

  it("reports dirty when content diverges from saved content", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });

    const isDirty = fileTabContentStore.getState().updateContent("tab-1", "a2");

    expect(isDirty).toBe(true);
    expect(fileTabContentStore.getState().byTabId["tab-1"]!.content).toBe("a2");
  });

  it("clears the dirty flag when saved", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });
    fileTabContentStore.getState().updateContent("tab-1", "a2");

    const isDirty = fileTabContentStore.getState().markSaved("tab-1");

    expect(isDirty).toBe(false);
    expect(fileTabContentStore.getState().byTabId["tab-1"]!.savedContent).toBe("a2");
  });

  it("refreshes a clean tab from disk", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });

    const changed = fileTabContentStore.getState().refreshFromDisk("tab-1", {
      content: "from-disk",
      deleted: false,
    });

    expect(changed).toBe(true);
    expect(fileTabContentStore.getState().byTabId["tab-1"]!.content).toBe("from-disk");
    expect(fileTabContentStore.getState().byTabId["tab-1"]!.savedContent).toBe("from-disk");
  });

  it("marks a missing file deleted", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });

    fileTabContentStore.getState().refreshFromDisk("tab-1", { content: "", deleted: true });

    expect(fileTabContentStore.getState().byTabId["tab-1"]!.isDeleted).toBe(true);
    expect(fileTabContentStore.getState().byTabId["tab-1"]!.content).toBe("");
  });

  it("does not overwrite a dirty tab during disk refresh", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });
    fileTabContentStore.getState().updateContent("tab-1", "local-edits");

    const changed = fileTabContentStore.getState().refreshFromDisk("tab-1", {
      content: "from-disk",
      deleted: false,
    });

    expect(changed).toBe(false);
    expect(fileTabContentStore.getState().byTabId["tab-1"]!.content).toBe("local-edits");
  });

  it("removes tab data when tabs close", () => {
    fileTabContentStore.getState().seed({ tabId: "tab-1", path: "src/a.ts", content: "a1" });
    fileTabContentStore.getState().seed({ tabId: "tab-2", path: "src/b.ts", content: "b1" });

    fileTabContentStore.getState().removeTabData(["tab-1"]);

    expect(fileTabContentStore.getState().byTabId["tab-1"]).toBeUndefined();
    expect(fileTabContentStore.getState().byTabId["tab-2"]).toBeDefined();
  });
});
