// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueuedMessageList } from "./QueuedMessageList";

afterEach(() => {
  cleanup();
});

describe("QueuedMessageList", () => {
  it("renders nothing when both arrays are empty", () => {
    const { container } = render(<QueuedMessageList steering={[]} followUp={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders steering messages before followUp messages", () => {
    render(<QueuedMessageList steering={["steer first"]} followUp={["follow second"]} />);

    const items = screen.getAllByText(/steer first|follow second/);
    expect(items[0]?.textContent).toBe("steer first");
    expect(items[1]?.textContent).toBe("follow second");
  });

  it("renders a queued-message-list testid wrapping all items", () => {
    render(<QueuedMessageList steering={["a"]} followUp={["b"]} />);
    expect(screen.getByTestId("queued-message-list")).toBeTruthy();
  });

  it("renders message text unchanged when under the truncation limit", () => {
    const short = "a".repeat(119);
    render(<QueuedMessageList steering={[short]} followUp={[]} />);
    expect(screen.getByText(short)).toBeTruthy();
  });

  it("renders message text unchanged when exactly at the truncation limit", () => {
    const exact = "a".repeat(120);
    render(<QueuedMessageList steering={[exact]} followUp={[]} />);
    expect(screen.getByText(exact)).toBeTruthy();
  });

  it("truncates message text and appends ellipsis when over the limit", () => {
    const long = "b".repeat(121);
    render(<QueuedMessageList steering={[long]} followUp={[]} />);
    expect(screen.getByText(`${"b".repeat(120)}…`)).toBeTruthy();
    expect(screen.queryByText(long)).toBeNull();
  });

  it("renders only followUp items when steering is empty", () => {
    render(<QueuedMessageList steering={[]} followUp={["only follow"]} />);
    expect(screen.getByTestId("queued-message-list")).toBeTruthy();
    expect(screen.getByText("only follow")).toBeTruthy();
  });

  it("renders only steering items when followUp is empty", () => {
    render(<QueuedMessageList steering={["only steer"]} followUp={[]} />);
    expect(screen.getByTestId("queued-message-list")).toBeTruthy();
    expect(screen.getByText("only steer")).toBeTruthy();
  });
});
