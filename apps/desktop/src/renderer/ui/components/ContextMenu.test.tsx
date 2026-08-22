// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

function ContextMenuHarness(input: { items: ContextMenuEntry[] }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <ContextMenu
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
      }}
      anchorPosition={{ top: 10, left: 10 }}
      items={input.items}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ContextMenu", () => {
  it("closes nested menus before running a selection handler", () => {
    const onJetBrainsSelect = vi.fn();

    render(
      <ContextMenuHarness
        items={[
          {
            id: "open-in",
            label: "Open in",
            items: [
              {
                id: "jetbrains",
                label: "JetBrains",
                items: [
                  {
                    id: "webstorm",
                    label: "WebStorm",
                    onSelect: onJetBrainsSelect,
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Open in" }));
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "JetBrains" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "WebStorm" }));

    expect(screen.queryByRole("menuitem", { name: "Open in" })).toBeNull();
    expect(onJetBrainsSelect).toHaveBeenCalledTimes(1);
  });

  it("renders divider entries between action items", () => {
    render(
      <ContextMenuHarness
        items={[
          { id: "copy", label: "Copy", onSelect: () => undefined },
          { kind: "divider", id: "divider-1" },
          { id: "paste", label: "Paste", onSelect: () => undefined },
        ]}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Paste" })).toBeTruthy();
    expect(document.querySelectorAll("hr.MuiDivider-root").length).toBeGreaterThan(0);
  });
});
