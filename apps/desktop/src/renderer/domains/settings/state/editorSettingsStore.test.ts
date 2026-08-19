// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { EDITOR_SETTINGS_STORE_STORAGE_KEY, editorSettingsStore } from "./editorSettingsStore";

describe("editorSettingsStore", () => {
  afterEach(() => {
    editorSettingsStore.setState({
      codeThemePreference: "yishan",
      editorFontSize: 13,
      wordWrap: true,
    });
    window.localStorage.clear();
  });

  it("has correct defaults", () => {
    const state = editorSettingsStore.getState();
    expect(state.codeThemePreference).toBe("yishan");
    expect(state.editorFontSize).toBe(13);
    expect(state.wordWrap).toBe(true);
  });

  it("setCodeThemePreference updates state", () => {
    editorSettingsStore.getState().setCodeThemePreference("dracula");
    expect(editorSettingsStore.getState().codeThemePreference).toBe("dracula");
  });

  it("setEditorFontSize updates state", () => {
    editorSettingsStore.getState().setEditorFontSize(16);
    expect(editorSettingsStore.getState().editorFontSize).toBe(16);
  });

  it("setWordWrap updates state", () => {
    editorSettingsStore.getState().setWordWrap(false);
    expect(editorSettingsStore.getState().wordWrap).toBe(false);
  });

  it("persists state to localStorage", () => {
    editorSettingsStore.getState().setCodeThemePreference("github");
    editorSettingsStore.getState().setEditorFontSize(15);
    editorSettingsStore.getState().setWordWrap(false);

    const stored = window.localStorage.getItem(EDITOR_SETTINGS_STORE_STORAGE_KEY);
    expect(stored).toContain('"codeThemePreference":"github"');
    expect(stored).toContain('"editorFontSize":15');
    expect(stored).toContain('"wordWrap":false');
  });

  it("hydrates persisted state", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          codeThemePreference: "one-dark",
          editorFontSize: 14,
          wordWrap: false,
        },
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().codeThemePreference).toBe("one-dark");
    expect(editorSettingsStore.getState().editorFontSize).toBe(14);
    expect(editorSettingsStore.getState().wordWrap).toBe(false);
  });

  it("normalizes invalid codeThemePreference to yishan", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          codeThemePreference: "invalid-theme",
          editorFontSize: 13,
          wordWrap: true,
        },
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().codeThemePreference).toBe("yishan");
  });

  it("clamps editorFontSize above max to 18", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          codeThemePreference: "yishan",
          editorFontSize: 999,
          wordWrap: true,
        },
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().editorFontSize).toBe(18);
  });

  it("clamps editorFontSize below min to 11", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          codeThemePreference: "yishan",
          editorFontSize: -5,
          wordWrap: true,
        },
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().editorFontSize).toBe(11);
  });

  it("rounds editorFontSize to integer", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          codeThemePreference: "yishan",
          editorFontSize: 13.7,
          wordWrap: true,
        },
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().editorFontSize).toBe(14);
  });

  it("coerces non-boolean wordWrap to default true", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          codeThemePreference: "yishan",
          editorFontSize: 13,
          wordWrap: "false",
        },
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().wordWrap).toBe(true);
  });

  it("falls back to defaults when persisted values are absent", () => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {},
        version: 0,
      }),
    );

    void editorSettingsStore.persist.rehydrate();

    expect(editorSettingsStore.getState().codeThemePreference).toBe("yishan");
    expect(editorSettingsStore.getState().editorFontSize).toBe(13);
    expect(editorSettingsStore.getState().wordWrap).toBe(true);
  });
});
