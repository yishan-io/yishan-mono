// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { LuSquareTerminal } from "react-icons/lu";
import { afterEach, describe, expect, it } from "vitest";
import { ToolPathSummary } from "./ToolPathSummary";

afterEach(() => {
  cleanup();
});

describe("ToolPathSummary", () => {
  it("wraps paths across lines by default", () => {
    render(<ToolPathSummary icon={<LuSquareTerminal />} path="a very long path" />);

    const element = screen.getByText("a very long path");
    expect(element).toBeTruthy();
    expect(element.title).toBe("");
  });

  it("renders a single truncated line with the full value as a title when truncate is set", () => {
    render(
      <ToolPathSummary icon={<LuSquareTerminal />} path="bun run typecheck && bun run lint && bun run test" truncate />,
    );

    const element = screen.getByText("bun run typecheck && bun run lint && bun run test");
    expect(element.title).toBe("bun run typecheck && bun run lint && bun run test");
    expect(window.getComputedStyle(element).whiteSpace).toBe("nowrap");
    expect(window.getComputedStyle(element).textOverflow).toBe("ellipsis");
    expect(window.getComputedStyle(element).overflow).toBe("hidden");
  });
});
