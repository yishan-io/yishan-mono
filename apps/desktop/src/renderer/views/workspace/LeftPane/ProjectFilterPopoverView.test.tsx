// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAppTheme } from "../../../testUtils/renderWithAppTheme";
import { ProjectFilterPopoverView } from "./ProjectFilterPopoverView";

const mocked = vi.hoisted(() => {
  const stateRef: {
    current: {
      projects: Array<{ id: string; name: string; path: string }>;
      displayProjectIds: string[];
      setDisplayProjectIds: (repoIds: string[]) => void;
      workspaceListHierarchyMode: "by_project" | "by_node";
      setWorkspaceListHierarchyMode: (mode: "by_project" | "by_node") => void;
      setOrderedWorkspaceIds: (ids: string[]) => void;
    };
  } = {
    current: {
      projects: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      displayProjectIds: ["repo-1"],
      setDisplayProjectIds: () => undefined,
      workspaceListHierarchyMode: "by_project",
      setWorkspaceListHierarchyMode: () => undefined,
      setOrderedWorkspaceIds: () => undefined,
    },
  };

  const workspaceStore = vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current));

  return {
    stateRef,
    workspaceStore,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "project.actions.pin": "Pin projects",
        "project.pin.actions.all": "All",
        "project.pin.searchPlaceholder": "Search projects",
        "project.pin.searchAriaLabel": "Search projects",
        "project.pin.sections.hirarchy": "Hierarchy",
        "project.pin.sections.projects": "Projects",
        "project.pin.hierarchy.byProject": "By project",
        "project.pin.hierarchy.byNode": "By node",
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProjectFilterPopoverView", () => {
  it("disables paper background image so arrow color matches in dark theme", () => {
    renderWithAppTheme(<ProjectFilterPopoverView />);

    fireEvent.click(screen.getByRole("button", { name: "Pin projects" }));

    const paper = document.querySelector(".MuiPopover-paper") as HTMLElement | null;
    expect(paper).toBeTruthy();
    expect(paper?.style.backgroundImage).toBe("none");
  });
});
