// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  it("renders placeholder and forwards typed values", () => {
    const onChange = vi.fn();

    render(<SearchInput value="" placeholder="Search files" onChange={onChange} />);

    const input = screen.getByLabelText("Search files");
    fireEvent.change(input, { target: { value: "readme" } });

    expect(onChange).toHaveBeenCalledWith("readme");
  });
});
