// @vitest-environment jsdom

import type { AutocompleteRenderInputParams } from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mui/material", async () => {
  const material = await vi.importActual<typeof import("@mui/material")>("@mui/material");

  return {
    ...material,
    Autocomplete: ({ renderInput }: { renderInput: (params: AutocompleteRenderInputParams) => React.ReactNode }) =>
      renderInput({
        id: "model-autocomplete",
        disabled: false,
        fullWidth: false,
        slotProps: {
          inputLabel: {},
          input: {
            ref: () => {},
            className: "",
            startAdornment: null,
            endAdornment: null,
            onMouseDown: () => {},
          },
          htmlInput: { ref: () => {} },
        },
        size: "small",
      }),
  };
});
import { ModelAutocomplete } from "./ModelAutocomplete";

afterEach(() => {
  cleanup();
});

describe("ModelAutocomplete", () => {
  it("renders a small input by default", () => {
    render(<ModelAutocomplete options={[]} value="" onChange={() => {}} />);

    const input = screen.getByRole("textbox");
    const root = input.closest(".MuiInputBase-root");
    expect(root?.classList).toContain("MuiInputBase-sizeSmall");
  });

  it("renders a medium input when explicitly requested", () => {
    render(<ModelAutocomplete options={[]} value="" onChange={() => {}} size="medium" />);

    const input = screen.getByRole("textbox");
    const root = input.closest(".MuiInputBase-root");
    expect(root?.classList).not.toContain("MuiInputBase-sizeSmall");
  });
});
