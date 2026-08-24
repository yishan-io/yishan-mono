// @vitest-environment jsdom

import { createAppTheme } from "@renderer/ui/theme";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalTaskTagChip, getLocalTaskTagChipSx } from "./LocalTaskTagChip";

describe("Local Task tag catalog aliases", () => {
  it("maps exact daemon-provided display aliases without client-side folding", () => {
    const catalog = [
      {
        id: "tag-fixture",
        key: "strasse",
        name: "Straße",
        aliases: ["STRASSE", "Straße"],
        color: "#A855F7",
      },
    ];

    // Chip resolves by exact alias match (case-sensitive, daemon-provided)
    expect(catalog.find((e) => e.aliases.includes("STRASSE"))?.color).toBe("#A855F7");
    expect(catalog.find((e) => e.aliases.includes("strasse"))?.color).toBeUndefined();
  });
});

describe("getLocalTaskTagChipSx", () => {
  it("keeps chip surfaces neutral while preserving wrapped full names", () => {
    const style = getLocalTaskTagChipSx(true)(createAppTheme("light"));

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

  it("omits minHeight when not dense", () => {
    const style = getLocalTaskTagChipSx(false)(createAppTheme("light"));

    expect(style).not.toHaveProperty("minHeight");
    expect(style).toHaveProperty("height", "auto");
  });
});

describe("LocalTaskTagChip", () => {
  it("renders a color dot and label without an icon svg", () => {
    render(
      <LocalTaskTagChip
        tag="A complete tag name"
        tagCatalog={[
          {
            id: "tag-fixture",
            key: "tag",
            name: "A complete tag name",
            aliases: ["A complete tag name"],
            color: "#EF4444",
          },
        ]}
      />,
    );

    const chip = screen.getByText("A complete tag name").closest(".MuiChip-root");
    expect(chip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    expect(chip?.querySelector("svg")).toBeNull();
    expect(chip?.getAttribute("style")).toBeNull();
  });
});
