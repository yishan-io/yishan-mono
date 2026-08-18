// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDITOR_SETTINGS_STORE_STORAGE_KEY,
  editorSettingsStore,
} from "../../../domains/settings/state/editorSettingsStore";
import { EditorSettingsView } from "./EditorSettingsView";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("EditorSettingsView", () => {
  afterEach(() => {
    editorSettingsStore.setState({
      codeThemePreference: "yishan",
      editorFontSize: 13,
      wordWrap: true,
    });
    window.localStorage.removeItem(EDITOR_SETTINGS_STORE_STORAGE_KEY);
    cleanup();
  });

  it("renders theme, font size, and word wrap controls with i18n labels", () => {
    render(<EditorSettingsView />);

    expect(screen.getByText("settings.appearance.editor.title")).toBeTruthy();
    expect(screen.getByLabelText("settings.appearance.editor.theme.label")).toBeTruthy();
    expect(screen.getByLabelText("settings.appearance.editor.fontSize.label")).toBeTruthy();
    expect(screen.getByLabelText("settings.appearance.editor.wordWrap.label")).toBeTruthy();
  });

  it("persists the code theme family selection", () => {
    render(<EditorSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.appearance.editor.theme.label"));
    fireEvent.click(screen.getByRole("option", { name: "Dracula" }));

    expect(window.localStorage.getItem(EDITOR_SETTINGS_STORE_STORAGE_KEY)).toContain('"codeThemePreference":"dracula"');
  });

  it("persists the word wrap toggle", () => {
    render(<EditorSettingsView />);

    fireEvent.click(screen.getByRole("switch", { name: "settings.appearance.editor.wordWrap.label" }));

    expect(window.localStorage.getItem(EDITOR_SETTINGS_STORE_STORAGE_KEY)).toContain('"wordWrap":false');
  });
});
