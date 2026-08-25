// @vitest-environment jsdom

import { MenuItem } from "@mui/material";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LocalTaskHubVirtualizedFilterValues } from "./LocalTaskHubVirtualizedFilterValues";

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

function triggerViewportMeasurement(menu: HTMLElement) {
  const observer = ResizeObserverMock.instances.find((instance) => instance.hasObserved(menu));
  expect(observer).toBeTruthy();
  act(() => observer?.trigger(menu));
}

function controlMenuScrolling(menu: HTMLElement) {
  Object.defineProperty(menu, "scrollTo", {
    configurable: true,
    value: ({ top }: ScrollToOptions) => {
      Object.defineProperty(menu, "scrollTop", { configurable: true, value: top ?? 0 });
      fireEvent.scroll(menu);
    },
  });
}

afterEach(() => {
  cleanup();
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
});

it("navigates past the initial virtual range and selects the focused filter value", async () => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  const user = userEvent.setup();
  const handleSelect = vi.fn();
  const options = Array.from({ length: 100 }, (_, index) => `Project ${index}`);

  render(
    <LocalTaskHubVirtualizedFilterValues
      options={options}
      renderOption={(project) => <MenuItem onClick={() => handleSelect(project)}>{project}</MenuItem>}
    />,
  );

  const menu = screen.getByRole("menu");
  triggerViewportMeasurement(menu);
  controlMenuScrolling(menu);
  expect(screen.queryByRole("menuitem", { name: "Project 20" })).toBeNull();

  for (let index = 0; index < 12; index += 1) {
    await user.keyboard("{ArrowDown}");
  }
  await waitFor(() => expect(document.activeElement?.textContent).toContain("Project 12"));

  for (let index = 12; index < 20; index += 1) {
    await user.keyboard("{ArrowDown}");
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  const focusedProject = await screen.findByRole("menuitem", { name: "Project 20" });
  await waitFor(() => expect(document.activeElement).toBe(focusedProject));
  expect(menu.querySelectorAll(":scope > li").length).toBeLessThan(20);

  await user.keyboard("{Enter}");
  expect(handleSelect).toHaveBeenCalledWith("Project 20");

  await user.keyboard("{Home}");
  await waitFor(() => expect(document.activeElement?.textContent).toContain("Project 0"));

  await user.keyboard("{End}");
  const lastProject = await screen.findByRole("menuitem", { name: "Project 99" });
  await waitFor(() => expect(document.activeElement).toBe(lastProject));
});
