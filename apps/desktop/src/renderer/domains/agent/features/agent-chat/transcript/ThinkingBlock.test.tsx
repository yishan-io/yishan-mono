// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThinkingBlock } from "./ThinkingBlock";
afterEach(cleanup);
describe("ThinkingBlock display", () => {
  it("uses explicit summary and disclosure, not signature parsing", () => {
    render(
      <ThinkingBlock
        model={{
          kind: "thinking",
          key: "t",
          text: "private details",
          summary: "Chosen summary",
          hasDetails: true,
          isStreaming: true,
        }}
      />,
    );
    expect(screen.getByText("Chosen summary")).toBeTruthy();
    expect(screen.getByText("Thinking")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Toggle thought details" }));
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("private details")).toBeTruthy();
  });
  it("honors hasDetails false even with different text", () => {
    render(
      <ThinkingBlock
        model={{
          kind: "thinking",
          key: "t2",
          text: "different",
          summary: "Summary",
          hasDetails: false,
          isStreaming: false,
        }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("different")).toBeNull();
    expect(screen.getByText("Thought")).toBeTruthy();
  });
});
