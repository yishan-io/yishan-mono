// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISPLAY_SETTINGS_STORE_STORAGE_KEY,
  displaySettingsStore,
} from "../../../features/settings/state/displaySettingsStore";
import { MarkdownSettingsView } from "./MarkdownSettingsView";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("MarkdownSettingsView", () => {
  afterEach(() => {
    displaySettingsStore.setState({
      markdownThemePreference: "inherit",
      markdownPreviewFontSize: "medium",
      markdownPreviewWidth: "readable",
      isMarkdownOutlineVisible: false,
    });
    window.localStorage.removeItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY);
    cleanup();
  });

  it("persists the markdown preview theme preference", () => {
    render(<MarkdownSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.appearance.markdown.theme.label"));
    fireEvent.click(screen.getByRole("option", { name: "settings.appearance.markdown.theme.options.dark" }));

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"markdownThemePreference":"dark"',
    );
  });
});
