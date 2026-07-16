// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThinkingBlock } from "./ThinkingBlock";

afterEach(() => {
  cleanup();
});

describe("ThinkingBlock", () => {
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
