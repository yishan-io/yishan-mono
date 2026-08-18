// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomizeSettingsView } from "./CustomizeSettingsView";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../../domains/settings/commands/customizeCommands", () => ({
  listExtensions: () => Promise.resolve([]),
  installExtension: () => Promise.resolve(),
  removeExtension: () => Promise.resolve(),
  updateExtension: () => Promise.resolve(),
}));

describe("CustomizeSettingsView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the three sub-nav tabs and defaults to extensions", () => {
    render(<CustomizeSettingsView />);

    expect(screen.getByText("settings.customize.panels.extensions")).toBeTruthy();
    expect(screen.getByText("settings.customize.panels.skills")).toBeTruthy();
    expect(screen.getByText("settings.customize.panels.agents")).toBeTruthy();
    expect(screen.getByTestId("extensions-settings-panel")).toBeTruthy();
  });

  it("deep-links to the agents panel via the focus prop", () => {
    render(<CustomizeSettingsView focus="agents" />);

    expect(screen.getByTestId("agents-settings-panel")).toBeTruthy();
    expect(screen.queryByTestId("extensions-settings-panel")).toBeNull();
  });

  it("deep-links to the skills panel via the focus prop", () => {
    render(<CustomizeSettingsView focus="skills" />);

    expect(screen.getByTestId("skills-settings-panel")).toBeTruthy();
    expect(screen.queryByTestId("extensions-settings-panel")).toBeNull();
  });
});
