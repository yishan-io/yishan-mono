// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectCommitComparison, formatRelativeCommitTime } from "./ProjectCommitComparison";

afterEach(() => {
  cleanup();
});

describe("ProjectCommitComparison", () => {
  it("formats short relative commit times", () => {
    const now = Date.parse("2026-03-23T12:00:00.000Z");

    expect(formatRelativeCommitTime("2026-03-23T11:56:00.000Z", now)).toBe("4m ago");
    expect(formatRelativeCommitTime("2026-03-23T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatRelativeCommitTime("2026-03-20T12:00:00.000Z", now)).toBe("3d ago");
    expect(formatRelativeCommitTime("2026-01-10T12:00:00.000Z", now)).toBe("2mo ago");
    expect(formatRelativeCommitTime("2024-03-23T12:00:00.000Z", now)).toBe("2y ago");
  });

  it("renders fixed target branch and routes scope selections", () => {
    const onSelectUncommitted = vi.fn();
    const onSelectAll = vi.fn();
    const onSelectCommit = vi.fn();

    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [
            { path: "src/a.ts", status: "M" },
            { path: "src/b.ts", status: "A" },
          ],
          commits: [
            {
              hash: "abc123456",
              shortHash: "abc1234",
              authorName: "Pat",
              committedAt: "2026-03-23T08:00:00+00:00",
              subject: "feat: improve flow",
              changedFiles: [
                { path: "src/a.ts", status: "M" },
                { path: "src/b.ts", status: "A" },
              ],
            },
          ],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
        selectedComparison="uncommitted"
        onSelectUncommitted={onSelectUncommitted}
        onSelectAll={onSelectAll}
        onSelectCommit={onSelectCommit}
      />,
    );

    expect(screen.getByText("feature/work")).toBeTruthy();
    expect(screen.getByTestId("commit-comparison-target-branch").textContent).toBe("main");
    expect(screen.getByRole("combobox", { name: "Change scope" })).toBeTruthy();
    expect(screen.queryByTestId("commit-comparison-list")).toBeNull();

    const scopeInput = screen.getByRole("combobox", { name: "Change scope" });

    fireEvent.mouseDown(scopeInput);
    expect(screen.getByRole("option", { name: "Uncommitted" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "All changes (2)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "abc1234 feat: improve flow" })).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: "All changes (2)" }));
    expect(onSelectAll).toHaveBeenCalled();

    fireEvent.mouseDown(scopeInput);
    fireEvent.click(screen.getByRole("option", { name: "abc1234 feat: improve flow" }));
    expect(onSelectCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "abc123456",
        shortHash: "abc1234",
      }),
    );
  });

  it("shows target-branch loading indicator when comparison is refreshing", () => {
    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [],
          commits: [],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
        isTargetBranchLoading
      />,
    );

    expect(screen.getByTestId("commit-comparison-target-loading")).toBeTruthy();
  });

  it("does not render an empty-state message when no commits are ahead", () => {
    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [],
          commits: [],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Change scope" })).toBeTruthy();
    expect(screen.queryByText(/No commits ahead of/i)).toBeNull();
  });

  it("highlights the selected 'all' option when dropdown opens with selectedComparison='all'", () => {
    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [
            { path: "src/a.ts", status: "M" },
            { path: "src/b.ts", status: "A" },
          ],
          commits: [
            {
              hash: "abc123456",
              shortHash: "abc1234",
              authorName: "Pat",
              committedAt: "2026-03-23T08:00:00+00:00",
              subject: "feat: improve flow",
              changedFiles: [{ path: "src/a.ts", status: "M" }],
            },
          ],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
        selectedComparison="all"
      />,
    );

    const scopeInput = screen.getByRole("combobox", { name: "Change scope" });
    fireEvent.mouseDown(scopeInput);

    const allOption = screen.getByRole("option", { name: "All changes (2)" });
    const uncommittedOption = screen.getByRole("option", { name: "Uncommitted" });

    expect(allOption.getAttribute("aria-selected")).toBe("true");
    expect(uncommittedOption.getAttribute("aria-selected")).toBe("false");
  });

  it("highlights a specific commit option when dropdown opens with that commit selected", () => {
    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [
            { path: "src/a.ts", status: "M" },
            { path: "src/b.ts", status: "D" },
          ],
          commits: [
            {
              hash: "abc123456",
              shortHash: "abc1234",
              authorName: "Pat",
              committedAt: "2026-03-23T08:00:00+00:00",
              subject: "feat: improve flow",
              changedFiles: [{ path: "src/a.ts", status: "M" }],
            },
            {
              hash: "def789012",
              shortHash: "def7890",
              authorName: "Sam",
              committedAt: "2026-03-22T08:00:00+00:00",
              subject: "fix: resolve issue",
              changedFiles: [{ path: "src/b.ts", status: "D" }],
            },
          ],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
        selectedComparison="def789012"
      />,
    );

    const scopeInput = screen.getByRole("combobox", { name: "Change scope" });
    fireEvent.mouseDown(scopeInput);

    const commitOption = screen.getByRole("option", { name: "def7890 fix: resolve issue" });
    const uncommittedOption = screen.getByRole("option", { name: "Uncommitted" });
    const allOption = screen.getByRole("option", { name: "All changes (2)" });

    expect(commitOption.getAttribute("aria-selected")).toBe("true");
    expect(uncommittedOption.getAttribute("aria-selected")).toBe("false");
    expect(allOption.getAttribute("aria-selected")).toBe("false");
  });

  it("highlights 'uncommitted' only when it is actually the selected comparison", () => {
    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [{ path: "src/a.ts", status: "A" }],
          commits: [
            {
              hash: "abc123456",
              shortHash: "abc1234",
              authorName: "Pat",
              committedAt: "2026-03-23T08:00:00+00:00",
              subject: "feat: improve flow",
              changedFiles: [{ path: "src/a.ts", status: "A" }],
            },
          ],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
        selectedComparison="uncommitted"
      />,
    );

    const scopeInput = screen.getByRole("combobox", { name: "Change scope" });
    fireEvent.mouseDown(scopeInput);

    const uncommittedOption = screen.getByRole("option", { name: "Uncommitted" });
    const allOption = screen.getByRole("option", { name: "All changes (1)" });

    expect(uncommittedOption.getAttribute("aria-selected")).toBe("true");
    expect(allOption.getAttribute("aria-selected")).toBe("false");
  });

  it("maintains correct focus after keyboard open (focus then arrow keys)", () => {
    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: "feature/work",
          targetBranch: "main",
          allChangedFiles: [
            { path: "src/a.ts", status: "M" },
            { path: "src/b.ts", status: "R" },
          ],
          commits: [
            {
              hash: "abc123456",
              shortHash: "abc1234",
              authorName: "Pat",
              committedAt: "2026-03-23T08:00:00+00:00",
              subject: "feat: improve flow",
              changedFiles: [{ path: "src/a.ts", status: "M" }],
            },
          ],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
        selectedComparison="all"
      />,
    );

    const scopeInput = screen.getByRole("combobox", { name: "Change scope" });

    // Open via keyboard (ArrowDown opens the popup)
    fireEvent.keyDown(scopeInput, { key: "ArrowDown" });

    const allOption = screen.getByRole("option", { name: "All changes (2)" });
    expect(allOption.getAttribute("aria-selected")).toBe("true");

    // Close and verify re-open still shows correct selection
    fireEvent.keyDown(scopeInput, { key: "Escape" });
    fireEvent.mouseDown(scopeInput);

    const allOptionAgain = screen.getByRole("option", { name: "All changes (2)" });
    expect(allOptionAgain.getAttribute("aria-selected")).toBe("true");
  });

  it("truncates long current branch labels to avoid widening the panel", () => {
    const longBranch =
      "feature/super-long-branch-name-that-should-be-truncated-in-commit-comparison-header-to-keep-layout-stable";

    render(
      <ProjectCommitComparison
        comparison={{
          currentBranch: longBranch,
          targetBranch: "main",
          allChangedFiles: [],
          commits: [],
        }}
        targetBranch="main"
        comparisonScopeAriaLabel="Change scope"
      />,
    );

    const currentBranch = screen.getByTestId("commit-comparison-current-branch");
    expect(currentBranch.getAttribute("title")).toBe(longBranch);
  });
});
