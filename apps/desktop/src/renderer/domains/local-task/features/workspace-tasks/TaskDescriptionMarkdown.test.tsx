// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TaskDescriptionMarkdown } from "./TaskDescriptionMarkdown";

describe("TaskDescriptionMarkdown", () => {
  afterEach(cleanup);

  it("renders task descriptions as Markdown", async () => {
    render(<TaskDescriptionMarkdown content="Description with **important** context." />);

    const emphasizedText = await screen.findByText("important");
    expect(emphasizedText.tagName).toBe("STRONG");
    expect(screen.getByTestId("local-task-description-markdown")).toBeTruthy();
  });
});
