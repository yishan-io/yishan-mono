import { afterEach, describe, expect, it, vi } from "vitest";
import { selectLastUsedExternalAppId, selectWorkspaceListHierarchyMode } from "./projectSelectors";
import { setWorkspaceListHierarchyMode } from "./projectStateMutations";
import { projectStore } from "./projectStore";

const initialProjectStoreState = projectStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
  vi.clearAllMocks();
});

describe("Project state public surface extension (Phase 17)", () => {
  it("selectLastUsedExternalAppId reads the store", () => {
    projectStore.setState({ lastUsedExternalAppId: "vscode" });

    expect(selectLastUsedExternalAppId()).toBe("vscode");
  });

  it("selectWorkspaceListHierarchyMode reads the store default", () => {
    expect(selectWorkspaceListHierarchyMode()).toBe("by_project");
  });

  it("setWorkspaceListHierarchyMode forwards to the store", () => {
    const spy = vi.fn();
    projectStore.setState({ setWorkspaceListHierarchyMode: spy });

    setWorkspaceListHierarchyMode("by_node");

    expect(spy).toHaveBeenCalledWith("by_node");
  });
});
