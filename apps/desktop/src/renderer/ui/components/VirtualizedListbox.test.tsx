// @vitest-environment jsdom

import { Autocomplete, TextField } from "@mui/material";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VirtualizedListbox } from "./VirtualizedListbox";

const virtualizerState = vi.hoisted(() => ({ scrollOwners: [] as Array<HTMLElement | null> }));

vi.mock("@tanstack/react-virtual", async () => {
  const React = await import("react");
  return {
    useVirtualizer: ({ count, getScrollElement }: { count: number; getScrollElement: () => HTMLElement | null }) => {
      const [start, setStart] = React.useState(0);
      React.useLayoutEffect(() => {
        virtualizerState.scrollOwners.push(getScrollElement());
      });
      return {
        getTotalSize: () => count * 36,
        getVirtualItems: () =>
          Array.from({ length: Math.min(12, count - start) }, (_, offset) => ({
            index: start + offset,
            key: start + offset,
            start: (start + offset) * 36,
            size: 36,
          })),
        scrollToIndex: (index: number) => setStart(Math.max(0, Math.min(index - 4, count - 12))),
      };
    },
  };
});

const options = Array.from({ length: 75 }, (_, index) => `Option ${index}`);

function AutocompleteConsumer() {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  return (
    <Autocomplete
      options={options}
      value={selectedOption}
      onChange={(_event, option) => setSelectedOption(option)}
      renderInput={(params) => <TextField {...params} label="Task" />}
      slotProps={{ listbox: { component: VirtualizedListbox } }}
    />
  );
}

afterEach(() => {
  cleanup();
  virtualizerState.scrollOwners.length = 0;
});

describe("VirtualizedListbox", () => {
  it("uses the MUI listbox as scroll owner and keyboard-navigates beyond fifty options", async () => {
    const user = userEvent.setup();
    render(<AutocompleteConsumer />);
    const input = screen.getByRole("combobox", { name: "Task" });

    await user.click(input);
    await user.keyboard("{ArrowDown}".repeat(56));

    const listbox = screen.getByRole("listbox");
    await waitFor(() => expect(screen.getByRole("option", { name: "Option 55" })).toBeTruthy());
    expect(virtualizerState.scrollOwners.at(-1)).toBe(listbox);
    expect(listbox.querySelector(":scope > :not(li)")).toBeNull();

    await user.keyboard("{Enter}");
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) return;
    expect(input.value).toBe("Option 55");
  });
});
