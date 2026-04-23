// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material/styles";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppTheme } from "../../../theme";
import { ProjectFilterPopoverView } from "./ProjectFilterPopoverView";

const mocked = vi.hoisted(() => {
  const stateRef: {
    current: {
      repos: Array<{ id: string; name: string; path: string }>;
      displayRepoIds: string[];
      setDisplayRepoIds: (repoIds: string[]) => void;
    };
  } = {
    current: {
      repos: [{ id: "repo-1", name: "Repo 1", path: "/tmp/repo-1" }],
      displayRepoIds: ["repo-1"],
      setDisplayRepoIds: () => undefined,
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
        "project.actions.filter": "Filter",
        "project.filter.actions.all": "All",
        "project.filter.actions.clear": "Clear",
        "project.filter.searchPlaceholder": "Quick search projects",
        "project.filter.searchAriaLabel": "Quick search projects",
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
    render(
      <ThemeProvider theme={createAppTheme("dark")}>
        <ProjectFilterPopoverView />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    const paper = document.querySelector(".MuiPopover-paper") as HTMLElement | null;
    expect(paper).toBeTruthy();
    expect(paper?.style.backgroundImage).toBe("none");
  });
});
