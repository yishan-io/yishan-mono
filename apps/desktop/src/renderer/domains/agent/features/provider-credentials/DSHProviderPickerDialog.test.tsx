// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DSHProviderPickerDialog } from "./DSHProviderPickerDialog";

afterEach(cleanup);

describe("DSHProviderPickerDialog", () => {
  it("keeps an ambient provider open and shows its safe cloud-credential guidance", () => {
    const onSelect = vi.fn();
    render(
      <DSHProviderPickerDialog
        open
        providers={[
          {
            id: "amazon-bedrock",
            displayName: "Amazon Bedrock",
            authentication: "ambient",
            configured: false,
            setupRequired: false,
            setupStatus: "ambient",
            setupGuidance: "Uses system or cloud credentials configured on this computer.",
            models: [],
          },
        ]}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByText("Amazon Bedrock"));

    expect(screen.getByRole("alert").textContent).toBe("Uses system or cloud credentials configured on this computer.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
