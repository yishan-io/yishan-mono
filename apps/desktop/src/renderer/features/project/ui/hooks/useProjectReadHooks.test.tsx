// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { projectStore } from "../../state/projectStore";
import {
  useDisplayProjectIds,
  useLastUsedExternalAppId,
  useProjects,
  useWorkspaceListHierarchyMode,
} from "./useProjectReadHooks";

const initialProjectStoreState = projectStore.getState();

afterEach(() => {
  projectStore.setState(initialProjectStoreState, true);
});

describe("useProjectReadHooks — Project state read hooks (Phase 17)", () => {
  it("useProjects subscribes to the project list", () => {
    const projects = [
      {
        id: "project-1",
        name: "A",
        isFolder: false,
        isDeleted: false,
      },
    ];
    projectStore.setState({ projects });

    const { result } = renderHook(() => useProjects());

    expect(result.current).toEqual(projects);
  });

  it("useDisplayProjectIds defaults to an empty list", () => {
    projectStore.setState({ displayProjectIds: undefined });

    const { result } = renderHook(() => useDisplayProjectIds());

    expect(result.current).toEqual([]);
  });

  it("useLastUsedExternalAppId subscribes to the store", () => {
    projectStore.setState({ lastUsedExternalAppId: "vscode" });

    const { result } = renderHook(() => useLastUsedExternalAppId());

    expect(result.current).toBe("vscode");
  });

  it("useWorkspaceListHierarchyMode subscribes to the store", () => {
    projectStore.setState({ workspaceListHierarchyMode: "by_node" });

    const { result } = renderHook(() => useWorkspaceListHierarchyMode());

    expect(result.current).toBe("by_node");
  });
});
