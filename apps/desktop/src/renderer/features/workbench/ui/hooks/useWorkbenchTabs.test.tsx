// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { tabStore } from "../../state/tabStore";
import { useSelectedTabId, useTabById, useWorkspaceTabs } from "./useWorkbenchTabs";

const initialTabState = tabStore.getState();

afterEach(() => {
  tabStore.setState(initialTabState, true);
});

describe("useWorkbenchTabs — Workbench tab read hooks (Phase 17)", () => {
  it("useWorkspaceTabs subscribes to the tab list", () => {
    tabStore.setState({ tabs: [{ id: "tab-1", workspaceId: "workspace-1", title: "T", pinned: false, kind: "file", data: { path: "/tmp/a.txt", content: "", savedContent: "", isDirty: false, isTemporary: false } }] });

    const { result } = renderHook(() => useWorkspaceTabs());

    expect(result.current.map((tab) => tab.id)).toEqual(["tab-1"]);
  });

  it("useSelectedTabId subscribes to the selected tab id", () => {
    tabStore.setState({ selectedTabId: "tab-1" });

    const { result } = renderHook(() => useSelectedTabId());

    expect(result.current).toBe("tab-1");
  });

  it("useTabById returns the matching tab", () => {
    tabStore.setState({ tabs: [{ id: "tab-1", workspaceId: "workspace-1", title: "T", pinned: false, kind: "file", data: { path: "/tmp/a.txt", content: "", savedContent: "", isDirty: false, isTemporary: false } }] });

    const { result } = renderHook(() => useTabById("tab-1"));

    expect(result.current?.id).toBe("tab-1");
  });
});
