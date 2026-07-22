// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppTheme } from "../theme";
import { FileQuickOpenDialog } from "./FileQuickOpenDialog";

vi.mock("./fileTreeIcons", () => ({
  getFileTreeIcon: () => "mock-icon.svg",
}));

vi.mock("react-icons/bi", () => ({
  BiSearch: () => <svg data-testid="file-search-icon" />,
}));

afterEach(() => {
  cleanup();
});

function renderWithAppTheme(component: React.ReactNode) {
  return render(<ThemeProvider theme={createAppTheme("dark")}>{component}</ThemeProvider>);
}

describe("FileQuickOpenDialog", () => {
  it("uses a compact search input", async () => {
    renderWithAppTheme(
      <FileQuickOpenDialog
        open
        query=""
        selectedResultIndex={0}
        results={[]}
        placeholder="Search files..."
        emptyText="No matching files."
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        onInputKeyDown={vi.fn()}
        onSelectResultIndex={vi.fn()}
        onOpenResult={vi.fn()}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Search files..." });
    expect(input.getAttribute("style")).toContain("font-size: 14px");
    expect(input.getAttribute("style")).toContain("padding: 8px 0px");
    expect(input.closest(".MuiFormControl-root")?.querySelector(".MuiInputBase-sizeSmall")).toBeTruthy();
    expect(screen.getByTestId("file-search-icon")).toBeTruthy();
    expect(screen.queryByText("Search files")).toBeNull();
  });

  it("hides the bordered results container when there are no items", async () => {
    render(
      <FileQuickOpenDialog
        open
        query="missing"
        selectedResultIndex={0}
        results={[]}
        placeholder="Search files..."
        emptyText="No matching files."
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        onInputKeyDown={vi.fn()}
        onSelectResultIndex={vi.fn()}
        onOpenResult={vi.fn()}
      />,
    );

    expect(await screen.findByText("No matching files.")).toBeTruthy();
    expect(screen.queryByTestId("file-quick-open-results")).toBeNull();
  });

  it("forwards keyboard events from the input element", async () => {
    const onInputKeyDown = vi.fn();

    render(
      <FileQuickOpenDialog
        open
        query="but"
        selectedResultIndex={0}
        results={[
          {
            path: "src/components/Button.tsx",
            score: 1,
            highlightedPathIndexes: [0, 1, 2],
          },
        ]}
        placeholder="Search files..."
        emptyText="No matching files."
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        onInputKeyDown={onInputKeyDown}
        onSelectResultIndex={vi.fn()}
        onOpenResult={vi.fn()}
      />,
    );

    fireEvent.keyDown(await screen.findByRole("textbox", { name: "Search files..." }), { key: "ArrowDown" });

    expect(onInputKeyDown).toHaveBeenCalledTimes(1);
    expect(onInputKeyDown.mock.calls[0]?.[0].key).toBe("ArrowDown");
  });
});
