// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ModelAutocomplete } from "./ModelAutocomplete";

it("rejects free-form values when custom values are disabled", () => {
  const onChange = vi.fn();
  render(
    <ModelAutocomplete
      options={[{ id: "openai", name: "OpenAI" }]}
      value=""
      onChange={onChange}
      allowCustomValue={false}
    />,
  );

  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "unconfigured" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onChange).not.toHaveBeenCalled();
});
