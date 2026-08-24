// @vitest-environment jsdom

import { Box } from "@mui/material";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_LOCAL_TASK_TAG_CODE_POINTS } from "../localTaskTags";
import { LocalTaskTagsDisplay } from "./LocalTaskTagsDisplay";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("LocalTaskTagsDisplay", () => {
  it("shows full compact labels and excludes the overflow count from tag styling", () => {
    const maximumLengthTag = "a".repeat(MAX_LOCAL_TASK_TAG_CODE_POINTS);
    render(
      <Box sx={{ width: 80 }}>
        <LocalTaskTagsDisplay
          tags={[maximumLengthTag, maximumLengthTag.replace("a", "b"), "third"]}
          maxVisible={2}
          tagCatalog={[
            {
              id: "tag-fixture",
              key: maximumLengthTag,
              name: maximumLengthTag,
              aliases: [maximumLengthTag],
              color: "blue",
              customColor: null,
            },
          ]}
        />
      </Box>,
    );

    const overflowChip = screen.getByText("+1").closest(".MuiChip-root");
    const visibleChip = screen.getByText(maximumLengthTag).closest(".MuiChip-root");
    expect(overflowChip).toBeTruthy();
    expect(visibleChip).toBeTruthy();
    expect(getComputedStyle(visibleChip as Element).maxWidth).not.toBe("120px");
    expect(visibleChip?.querySelector("[data-tag-chip-dot]")).toBeTruthy();
    expect(getComputedStyle(visibleChip as Element).flexShrink).not.toBe("1");
    expect(overflowChip?.querySelector("svg")).toBeNull();
  });

  it("wraps every tag in the detail display instead of clipping them", () => {
    const { container } = render(
      <Box sx={{ width: 80 }}>
        <LocalTaskTagsDisplay tags={["first", "second", "third"]} />
      </Box>,
    );

    const tagsContainer = container.querySelector(".MuiBox-root .MuiBox-root");
    expect(tagsContainer).toBeTruthy();
    expect(getComputedStyle(tagsContainer as Element).flexWrap).toBe("wrap");
    expect(getComputedStyle(tagsContainer as Element).overflow).toBe("visible");
    expect(screen.getByText("third")).toBeTruthy();
  });
});
