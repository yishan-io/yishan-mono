// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import { SettingsSoundSelectRow } from "./SettingsSoundSelectRow";
import { SettingsVolumeRow } from "./SettingsVolumeRow";

describe("SettingsVolumeRow", () => {
  it("jumps to clicked hit area position and commits value", () => {
    const onChange = vi.fn();
    const onChangeCommitted = vi.fn();

    render(
      <SettingsVolumeRow
        title="Notification volume"
        valuePercent={40}
        onChange={onChange}
        onChangeCommitted={onChangeCommitted}
      />,
    );

    const sliderRoot = screen.getByRole("slider").closest(".MuiSlider-root");
    if (!(sliderRoot instanceof HTMLElement) || !(sliderRoot.parentElement instanceof HTMLElement)) {
      throw new Error("Expected slider root to be rendered.");
    }

    const sliderRailContainer = sliderRoot.parentElement;
    Object.defineProperty(sliderRailContainer, "getBoundingClientRect", {
      value: () => ({
        x: 100,
        y: 20,
        left: 100,
        top: 20,
        width: 200,
        height: 20,
        right: 300,
        bottom: 40,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(sliderRailContainer, { button: 0, clientX: 250 });

    expect(onChange).toHaveBeenCalledWith(75);
    expect(onChangeCommitted).toHaveBeenCalledWith(75);
  });
});

describe("SettingsSoundSelectRow", () => {
  it("fires change and preview callbacks from dropdown interactions", async () => {
    const onChange = vi.fn();
    const onPreview = vi.fn();

    render(
      <SettingsSoundSelectRow
        title="Run finished"
        value="chime"
        options={[
          { value: "chime", label: "Chime" },
          { value: "ping", label: "Ping" },
        ]}
        selectAriaLabel="Run finished sound selection"
        previewButtonAriaLabel={(option) => `${option.label} preview`}
        onChange={onChange}
        onPreview={onPreview}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Run finished sound selection" }));
    fireEvent.click(await screen.findByRole("option", { name: "Ping" }));

    expect(onChange).toHaveBeenCalledWith("ping");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Run finished sound selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chime preview" }));

    expect(onPreview).toHaveBeenCalledWith("chime");
  });

  it("marks only the active preview option as busy", async () => {
    render(
      <SettingsSoundSelectRow
        title="Run failed"
        value="alert"
        options={[
          { value: "alert", label: "Alert" },
          { value: "pop", label: "Pop" },
        ]}
        selectAriaLabel="Run failed sound selection"
        previewButtonAriaLabel={(option) => `${option.label} preview`}
        activePreviewValue="alert"
        onChange={() => undefined}
        onPreview={() => undefined}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Run failed sound selection" }));

    const alertPreviewButton = await screen.findByRole("button", { name: "Alert preview" });
    const popPreviewButton = await screen.findByRole("button", { name: "Pop preview" });

    expect(alertPreviewButton.getAttribute("aria-busy")).toBe("true");
    expect(popPreviewButton.getAttribute("aria-busy")).toBe("false");
    expect(within(alertPreviewButton).getByRole("progressbar")).toBeTruthy();
    expect(within(popPreviewButton).queryByRole("progressbar")).toBeNull();
  });
});
