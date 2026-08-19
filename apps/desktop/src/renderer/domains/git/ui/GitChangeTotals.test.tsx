// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GitChangeTotals } from "./GitChangeTotals";

afterEach(() => {
  cleanup();
});

describe("GitChangeTotals", () => {
  it("hides output when both values are zero by default", () => {
    render(<GitChangeTotals additions={0} deletions={0} testId="totals" />);

    expect(screen.queryByTestId("totals")).toBeNull();
  });

  it("renders both sides when there are changes", () => {
    render(<GitChangeTotals additions={9} deletions={2} testId="totals" />);

    const totals = screen.getByTestId("totals");
    expect(totals.textContent).toContain("+9");
    expect(totals.textContent).toContain("-2");
  });

  it("can hide zero-valued sides for compact file stats", () => {
    render(<GitChangeTotals additions={4} deletions={0} hideZeroSides testId="totals" />);

    const totals = screen.getByTestId("totals");
    expect(totals.textContent).toContain("+4");
    expect(totals.textContent).not.toContain("-0");
  });
});
