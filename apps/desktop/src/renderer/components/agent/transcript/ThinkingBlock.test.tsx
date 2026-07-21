// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThinkingBlock } from "./ThinkingBlock";

afterEach(() => {
  cleanup();
});

describe("ThinkingBlock", () => {
  it("removes bold markers from the visible summary", () => {
    render(
      <ThinkingBlock
        thinking="**Planning fallback direct code review**"
        thinkingSignature={{
          summary: [{ type: "summary_text", text: "**Planning fallback direct code review**" }],
        }}
        isStreaming={false}
      />,
    );

    expect(screen.getByText("Planning fallback direct code review")).toBeTruthy();
    expect(screen.queryByText("**Planning fallback direct code review**")).toBeNull();
  });

  it("separates multiple summary items with commas", () => {
    render(
      <ThinkingBlock
        thinking="First step Second step"
        thinkingSignature={{
          summary: [
            { type: "summary_text", text: "First step" },
            { type: "summary_text", text: "Second step" },
          ],
        }}
        isStreaming={false}
      />,
    );

    expect(screen.getByText("First step, Second step")).toBeTruthy();
    expect(screen.queryByTestId("thinking-chevron-right")).toBeNull();
  });

  it("uses a right chevron when collapsed and a down chevron when expanded", () => {
    render(
      <ThinkingBlock
        thinking="Inspecting the repository carefully"
        thinkingSignature={{
          summary: [{ type: "summary_text", text: "Inspecting the repository" }],
        }}
        isStreaming={false}
      />,
    );

    expect(screen.getByTestId("thinking-chevron-right")).toBeTruthy();
    expect(screen.queryByTestId("thinking-chevron-down")).toBeNull();

    fireEvent.click(screen.getByText("Thought"));

    expect(screen.queryByTestId("thinking-chevron-right")).toBeNull();
    expect(screen.getByTestId("thinking-chevron-down")).toBeTruthy();
  });
});
