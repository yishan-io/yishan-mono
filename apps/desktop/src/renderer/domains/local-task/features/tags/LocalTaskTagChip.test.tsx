// @vitest-environment jsdom

import { createAppTheme } from "@renderer/ui/theme";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalTaskTagChip, getLocalTaskTagChipSx } from "./LocalTaskTagChip";
import { getLocalTaskTagColor } from "./localTaskTagColorPresets";

describe("Local Task tag catalog aliases", () => {
  it("maps exact daemon-provided display aliases without client-side folding", () => {
    const catalog = [
      { key: "strasse", name: "Straße", aliases: ["STRASSE", "Straße"], color: "purple" as const, customColor: null },
    ];

    expect(getLocalTaskTagColor("STRASSE", catalog)).toBe("purple");
    expect(getLocalTaskTagColor("strasse", catalog)).toBeNull();
  });
});

describe("getLocalTaskTagChipSx", () => {
  it("keeps chip surfaces neutral while preserving wrapped full names", () => {
    const style = getLocalTaskTagChipSx("purple", true)(createAppTheme("light"));

    expect(style).toMatchObject({ height: "auto", minHeight: 18 });
    expect(style).not.toHaveProperty("borderColor");
    expect(style).not.toHaveProperty("bgcolor");
    expect(style).not.toHaveProperty("color");
    expect(style["& .MuiChip-label"]).toMatchObject({
      whiteSpace: "normal",
      overflow: "visible",
      textOverflow: "clip",
      overflowWrap: "anywhere",
    });
  });

  it("renders a color dot instead of a tag icon and leaves the chip uncolored", () => {
    render(
      <LocalTaskTagChip
        tag="A complete tag name"
        tagCatalog={[
          {
            key: "tag",
            name: "A complete tag name",
            aliases: ["A complete tag name"],
            color: "red",
            customColor: null,
          },
        ]}
      />,
    );

    const chip = screen.getByText("A complete tag name").closest(".MuiChip-root");
    expect(chip?.querySelector("[data-local-task-tag-dot]")).toBeTruthy();
    expect(chip?.querySelector("svg")).toBeNull();
    expect(chip?.getAttribute("style")).toBeNull();
  });
});
