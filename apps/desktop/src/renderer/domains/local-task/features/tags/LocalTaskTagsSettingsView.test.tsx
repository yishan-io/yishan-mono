// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalTaskTagCatalogEntry } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { LocalTaskTagsSettingsView } from "./LocalTaskTagsSettingsView";

const popoverProps = vi.hoisted(() => ({
  latest: undefined as
    | {
        anchorEl?: import("@mui/material").PopoverProps["anchorEl"];
        anchorOrigin?: import("@mui/material").PopoverOrigin;
        anchorPosition?: { left: number; top: number };
        anchorReference?: string;
        transformOrigin?: import("@mui/material").PopoverOrigin;
      }
    | undefined,
}));

vi.mock("@mui/material", async (importOriginal) => {
  const material = await importOriginal<typeof import("@mui/material")>();
  return {
    ...material,
    Popover: ({
      anchorEl,
      anchorOrigin,
      anchorPosition,
      anchorReference,
      children,
      open,
      transformOrigin,
    }: import("@mui/material").PopoverProps) => {
      if (open) {
        popoverProps.latest = { anchorEl, anchorOrigin, anchorPosition, anchorReference, transformOrigin };
      }
      return open ? <div data-testid="local-task-tag-color-picker-popover">{children}</div> : null;
    },
  };
});

const commands = vi.hoisted(() => ({
  deleteLocalTaskTag: vi.fn(async () => undefined),
  loadLocalTaskTagSuggestions: vi.fn(async () => undefined),
  renameLocalTaskTag: vi.fn(async () => ({ tag: createCatalogEntry(1) })),
  updateLocalTaskTagColor: vi.fn(async () => undefined),
}));
vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { tag?: string }) => (options?.tag ? `${key} ${options.tag}` : key),
  }),
}));

const initialState = localTaskStore.getState();

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
  trigger(element: Element): void {
    this.callback(
      [{ borderBoxSize: [{ blockSize: 480, inlineSize: 320 }], target: element } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  hasObserved(element: Element): boolean {
    return this.observedElements.has(element);
  }
}

function createCatalogEntry(index: number): LocalTaskTagCatalogEntry {
  return {
    id: `tag-${index}`,
    key: `tag-${index}`,
    name: `Tag ${index}`,
    aliases: [`Tag ${index}`, `Alias ${index}`],
    color: index === 1 ? "#3B82F6" : null,
  };
}

function renderSettingsView() {
  render(<LocalTaskTagsSettingsView />);
  const listbox = screen.queryByRole("listbox", { name: "localTask.tags.settings.list" });
  if (listbox) {
    const observer = ResizeObserverMock.instances.find((instance) => instance.hasObserved(listbox));
    act(() => observer?.trigger(listbox));
  }
}

describe("LocalTaskTagsSettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ResizeObserverMock.instances = [];
    popoverProps.latest = undefined;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    localTaskStore.setState({
      ...initialState,
      tagSuggestionsLoadState: "loaded",
      tagCatalog: [createCatalogEntry(1)],
    });
  });

  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
    vi.unstubAllGlobals();
  });

  it("loads and filters neutral rows by name and aliases", () => {
    renderSettingsView();
    expect(commands.loadLocalTaskTagSuggestions).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Tag 1")).toBeTruthy();
    expect(document.querySelector(".MuiChip-root")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "localTask.tags.settings.search" }), {
      target: { value: "ALIAS 1" },
    });
    expect(screen.getByText("Tag 1")).toBeTruthy();
  });

  it("uses ordinary labeled list rows with independently focusable color and rename controls", async () => {
    renderSettingsView();
    const user = userEvent.setup();

    expect(screen.getByRole("listitem", { name: "Tag 1" })).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("option")).toBeNull();

    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tag 1" }));
  });

  it("opens the color picker from the color dot itself", () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    expect(screen.getByRole("group", { name: "localTask.tags.colorPicker Tag 1" })).toBeTruthy();
  });

  it("anchors the color picker at the color dot's click-time bottom-left coordinate", () => {
    renderSettingsView();
    const colorDot = screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" });
    vi.spyOn(colorDot, "getBoundingClientRect").mockReturnValue({
      bottom: 146,
      height: 12,
      left: 84,
      right: 96,
      top: 134,
      width: 12,
      x: 84,
      y: 134,
      toJSON: () => ({}),
    });

    fireEvent.click(colorDot);

    expect(popoverProps.latest).toMatchObject({
      anchorPosition: { left: 84, top: 146 },
      anchorReference: "anchorPosition",
    });
  });

  it("anchors the custom color editor to the clicked color-wheel button", () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    const presetStrip = screen.getByLabelText("localTask.tags.presetColors");
    expect(presetStrip.querySelectorAll("button")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "localTask.tags.clearColor" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    const customColorButton = screen.getByRole("button", { name: "localTask.tags.customizeColor" });

    fireEvent.click(customColorButton);

    expect(popoverProps.latest?.anchorEl).toBe(customColorButton);
    expect(popoverProps.latest).toMatchObject({
      anchorOrigin: { horizontal: "left", vertical: "bottom" },
      anchorReference: "anchorEl",
      transformOrigin: { horizontal: "left", vertical: "top" },
    });
  });

  it("applies a valid custom hex color through the existing color mutation", async () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.customizeColor" }));
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.tags.customColorInput" }), {
      target: { value: "#1a2B3c" },
    });

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.applyCustomColor" }));

    await waitFor(() => expect(commands.updateLocalTaskTagColor).toHaveBeenCalledWith("tag-1", "#1A2B3C"));
  });

  it("synchronizes the hex input when the color plane and hue slider change", () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.customizeColor" }));

    const colorPlane = screen.getByRole("group", { name: "localTask.tags.customColorPlane" });
    vi.spyOn(colorPlane, "getBoundingClientRect").mockReturnValue({
      bottom: 180,
      height: 180,
      left: 0,
      right: 260,
      top: 0,
      width: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.mouseDown(colorPlane, { button: 0, clientX: 130, clientY: 45 });
    expect(screen.getByRole("textbox", { name: "localTask.tags.customColorInput" }).getAttribute("value")).toBe(
      "#BF6060",
    );

    fireEvent.change(screen.getByRole("slider", { name: "localTask.tags.customColorHue" }), {
      target: { value: "120" },
    });
    expect(screen.getByRole("textbox", { name: "localTask.tags.customColorInput" }).getAttribute("value")).toBe(
      "#60BF60",
    );
  });

  it("synchronizes the HSV controls from a valid hex input", () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.customizeColor" }));
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.tags.customColorInput" }), {
      target: { value: "#00FF00" },
    });

    expect(screen.getByRole("slider", { name: "localTask.tags.customColorHue" }).getAttribute("aria-valuenow")).toBe(
      "120",
    );
    expect(screen.getByRole("group", { name: "localTask.tags.customColorPlane" }).getAttribute("aria-valuetext")).toBe(
      "100% saturation, 100% value",
    );
    expect(screen.getByRole("slider", { name: "localTask.tags.customColorHue" }).getAttribute("aria-orientation")).toBe(
      "vertical",
    );
    expect(screen.getByText("localTask.tags.customColorHex")).toBeTruthy();
  });

  it("supports keyboard interaction in the saturation and value plane", () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.customizeColor" }));

    const colorPlane = screen.getByRole("group", { name: "localTask.tags.customColorPlane" });
    colorPlane.focus();
    expect(document.activeElement).toBe(colorPlane);
    fireEvent.keyDown(colorPlane, { key: "ArrowLeft" });
    expect(screen.getByRole("textbox", { name: "localTask.tags.customColorInput" }).getAttribute("value")).toBe(
      "#FF0303",
    );
  });

  it("updates the tag color and closes the picker", async () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.color.amber" }));

    await waitFor(() => expect(commands.updateLocalTaskTagColor).toHaveBeenCalledWith("tag-1", "#F59E0B"));
    expect(screen.queryByRole("group", { name: "localTask.tags.colorPicker Tag 1" })).toBeNull();
  });

  it("clears the tag color from the neutral swatch", async () => {
    renderSettingsView();
    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.editColor Tag 1" }));

    fireEvent.click(screen.getByRole("button", { name: "localTask.tags.clearColor" }));

    await waitFor(() => expect(commands.updateLocalTaskTagColor).toHaveBeenCalledWith("tag-1", null));
  });

  it("renames by stable ID and warns before merging into an existing name", async () => {
    localTaskStore.setState({ tagCatalog: [createCatalogEntry(1), createCatalogEntry(2)] });
    renderSettingsView();
    const user = userEvent.setup();

    await user.click(screen.getByText("Tag 1"));
    const input = screen.getByRole("textbox", { name: "localTask.tags.settings.rename Tag 1" });
    expect(input.getAttribute("placeholder")).toBe("localTask.tags.settings.renamePlaceholder");
    await user.clear(input);
    await user.type(input, "Tag 2");
    expect(screen.getByRole("alert").textContent).toContain("localTask.tags.settings.mergeWarning");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(commands.renameLocalTaskTag).toHaveBeenCalledWith("tag-1", "Tag 2"));
  });

  it("cancels inline rename with Escape", async () => {
    renderSettingsView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Tag 1"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "localTask.tags.settings.rename Tag 1" })).toBeNull();
    expect(commands.renameLocalTaskTag).not.toHaveBeenCalled();
  });

  it("confirms deletion and states that task associations are removed", async () => {
    renderSettingsView();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "localTask.tags.settings.delete Tag 1" }));
    expect(screen.getByRole("dialog").textContent).toContain("localTask.tags.settings.deleteDescription");
    await user.click(screen.getByRole("button", { name: "localTask.tags.settings.confirmDelete" }));
    await waitFor(() => expect(commands.deleteLocalTaskTag).toHaveBeenCalledWith("tag-1"));
  });

  it("shows pending controls and mutation errors", async () => {
    let resolveRename: (() => void) | undefined;
    commands.renameLocalTaskTag.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRename = () => resolve({ tag: createCatalogEntry(1) });
        }),
    );
    renderSettingsView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Tag 1"));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "localTask.tags.settings.rename Tag 1" }).hasAttribute("disabled")).toBe(
      true,
    );
    resolveRename?.();
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "localTask.tags.settings.rename Tag 1" })).toBeNull(),
    );

    commands.renameLocalTaskTag.mockRejectedValueOnce(new Error("daemon unavailable"));
    await user.click(screen.getByText("Tag 1"));
    await user.keyboard("{Enter}");
    expect((await screen.findByRole("alert")).textContent).toContain("daemon unavailable");
  });

  it("virtualizes more than 50 rows and supports keyboard navigation and rename", async () => {
    localTaskStore.setState({ tagCatalog: Array.from({ length: 75 }, (_, index) => createCatalogEntry(index)) });
    renderSettingsView();
    const user = userEvent.setup();
    const catalogRegion = screen.getByRole("region", { name: "localTask.tags.settings.list" });
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(catalogRegion);
    for (let index = 0; index < 55; index += 1) await user.keyboard("{ArrowDown}");
    expect(await screen.findByText("Tag 55")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(catalogRegion.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(catalogRegion.querySelectorAll("li").length).toBeLessThan(75);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "localTask.tags.settings.rename Tag 55" })).toBeTruthy();
  });

  it("renders loading, error with retry, and empty states", () => {
    localTaskStore.setState({ tagSuggestionsLoadState: "loading", tagCatalog: [] });
    renderSettingsView();
    expect(screen.getByRole("progressbar", { name: "localTask.tags.settings.loading" })).toBeTruthy();
    act(() => localTaskStore.setState({ tagSuggestionsLoadState: "error", tagSuggestionsError: "daemon unavailable" }));
    expect(screen.getByRole("alert").textContent).toContain("daemon unavailable");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    expect(commands.loadLocalTaskTagSuggestions).toHaveBeenCalledTimes(2);
    act(() => localTaskStore.setState({ tagSuggestionsLoadState: "loaded", tagSuggestionsError: null }));
    expect(screen.getByText("localTask.tags.settings.empty")).toBeTruthy();
  });
});
