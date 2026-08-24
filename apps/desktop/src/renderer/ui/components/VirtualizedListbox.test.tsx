// @vitest-environment jsdom

import { Autocomplete, TextField } from "@mui/material";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VirtualizedListbox } from "./VirtualizedListbox";

const options = Array.from({ length: 500 }, (_, index) => `Option ${index}`);
const MAX_RENDERED_OPTIONS = 20;

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private readonly observedElements = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  observe(element: Element): void {
    this.observedElements.add(element);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  unobserve(element: Element): void {
    this.observedElements.delete(element);
  }

  hasObserved(element: Element): boolean {
    return this.observedElements.has(element);
  }

  trigger(element: Element): void {
    this.callback(
      [{ borderBoxSize: [{ blockSize: 288, inlineSize: 320 }], target: element } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

function FreeSoloAutocompleteConsumer() {
  return (
    <Autocomplete
      freeSolo
      options={options}
      renderInput={(params) => <TextField {...params} label="Free text" />}
      slotProps={{ listbox: { component: VirtualizedListbox } }}
    />
  );
}

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

function triggerViewportMeasurement(listbox: HTMLElement) {
  const observer = ResizeObserverMock.instances.find((instance) => instance.hasObserved(listbox));
  expect(observer).toBeTruthy();
  act(() => observer?.trigger(listbox));
}

function controlListboxScrolling(listbox: HTMLElement) {
  Object.defineProperty(listbox, "scrollTo", {
    configurable: true,
    value: ({ top }: ScrollToOptions) => {
      Object.defineProperty(listbox, "scrollTop", { configurable: true, value: top ?? 0 });
      fireEvent.scroll(listbox);
    },
  });
}

afterEach(() => {
  cleanup();
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
});

describe("VirtualizedListbox", () => {
  it("uses deterministic viewport geometry to render a subset and update the range after scrolling", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const user = userEvent.setup();
    render(<AutocompleteConsumer />);
    const input = screen.getByRole("combobox", { name: "Task" });

    await user.click(input);
    const listbox = screen.getByRole("listbox");
    triggerViewportMeasurement(listbox);

    expect(screen.getByRole("option", { name: "Option 0" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Option 499" })).toBeNull();
    expect(listbox.querySelectorAll(":scope > li").length).toBeLessThanOrEqual(MAX_RENDERED_OPTIONS);
    expect(listbox.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(0);

    Object.defineProperty(listbox, "scrollTop", { configurable: true, value: 55 * 36 });
    await act(async () => {
      fireEvent.scroll(listbox);
    });

    const option = await screen.findByRole("option", { name: "Option 55" });
    expect(listbox.querySelector(":scope > :not(li)")).toBeNull();
    await user.click(option);
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) return;
    expect(input.value).toBe("Option 55");
  });

  it("navigates beyond the initial viewport and selects the highlighted option with Enter", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const user = userEvent.setup();
    render(<AutocompleteConsumer />);
    const input = screen.getByRole("combobox", { name: "Task" });

    await user.click(input);
    const listbox = screen.getByRole("listbox");
    triggerViewportMeasurement(listbox);
    controlListboxScrolling(listbox);

    for (let index = 0; index < 56; index += 1) {
      await user.keyboard("{ArrowDown}");
    }

    expect(input.getAttribute("aria-activedescendant")).toContain("option-55");
    expect(screen.getByRole("option", { name: "Option 55" }).id).toContain("option-55");

    await user.keyboard("{Home}");
    expect(input.getAttribute("aria-activedescendant")).toContain("option-0");
    expect(screen.getByRole("option", { name: "Option 0" }).className).toContain("Mui-focused");

    await user.keyboard("{End}");
    expect(input.getAttribute("aria-activedescendant")).toContain("option-499");
    expect(screen.getByRole("option", { name: "Option 499" }).className).toContain("Mui-focused");

    await user.keyboard("{PageUp}");
    expect(input.getAttribute("aria-activedescendant")).toContain("option-494");
    expect(screen.getByRole("option", { name: "Option 494" })).toBeTruthy();

    await user.keyboard("{PageDown}");
    expect(input.getAttribute("aria-activedescendant")).toContain("option-499");
    expect(screen.getByRole("option", { name: "Option 499" })).toBeTruthy();

    await user.keyboard("{PageUp}");
    expect(input.getAttribute("aria-activedescendant")).toContain("option-494");

    await user.keyboard("{Enter}");
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) return;
    expect(input.value).toBe("Option 494");
  });

  it("mounts and highlights the last option when ArrowUp starts without a highlight", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const user = userEvent.setup();
    render(<AutocompleteConsumer />);
    const input = screen.getByRole("combobox", { name: "Task" });

    await user.click(input);
    const listbox = screen.getByRole("listbox");
    triggerViewportMeasurement(listbox);
    controlListboxScrolling(listbox);

    await user.keyboard("{ArrowUp}");

    expect(input.getAttribute("aria-activedescendant")).toContain("option-499");
    expect(screen.getByRole("option", { name: "Option 499" }).className).toContain("Mui-focused");
  });

  it("preserves freeSolo text caret on Home and End without virtual navigation", async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const user = userEvent.setup();
    render(<FreeSoloAutocompleteConsumer />);
    const input = screen.getByRole("combobox", { name: "Free text" });
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) return;

    await user.click(input);
    const listbox = screen.getByRole("listbox");
    triggerViewportMeasurement(listbox);
    const scrollTo = vi.fn();
    Object.defineProperty(listbox, "scrollTo", { configurable: true, value: scrollTo });
    await user.type(input, "Option");

    await user.keyboard("{Home}");
    expect(input.selectionStart).toBe(0);
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(listbox.querySelector(".Mui-focused")).toBeNull();

    await user.keyboard("{End}");
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(listbox.querySelector(".Mui-focused")).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
