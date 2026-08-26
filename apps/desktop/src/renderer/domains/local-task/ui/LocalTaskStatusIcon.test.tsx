// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalTaskStatusIcon } from "./LocalTaskStatusIcon";

describe("LocalTaskStatusIcon", () => {
  it.each(["new", "progressing", "done", "cancelled", "unlinked"] as const)("renders the %s status", (status) => {
    render(<LocalTaskStatusIcon status={status} label={`Status: ${status}`} />);

    expect(
      screen.getByLabelText(`Status: ${status}`).querySelector("[data-testid='local-task-status-icon']"),
    ).toBeTruthy();
  });
});
