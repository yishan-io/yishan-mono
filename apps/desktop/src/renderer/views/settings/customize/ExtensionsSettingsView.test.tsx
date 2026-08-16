// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionsSettingsView } from "./ExtensionsSettingsView";

const mocked = {
  listExtensions: vi.fn(),
  installExtension: vi.fn(),
  removeExtension: vi.fn(),
  updateExtension: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? key.replace("{{name}}", String(params.name)) : key),
  }),
}));

vi.mock("../../../features/settings/commands/customizeCommands", () => ({
  listExtensions: () => mocked.listExtensions(),
  installExtension: (source: string) => mocked.installExtension(source),
  removeExtension: (source: string) => mocked.removeExtension(source),
  updateExtension: (source: string) => mocked.updateExtension(source),
}));

const OFFICIAL = {
  name: "@yishan-io/pi-notify",
  source: "npm:@yishan-io/pi-notify",
  version: "1.2.3",
  latestVersion: "2.0.0",
  hasUpdate: true,
  official: true,
  installed: true,
};

const USER = {
  name: "pi-web-fetch",
  source: "npm:pi-web-fetch",
  version: "0.4.0",
  latestVersion: "0.4.0",
  hasUpdate: false,
  official: false,
  installed: true,
};

const LOCAL_FILE = {
  name: "local-ext.ts",
  source: "local file",
  version: "",
  latestVersion: "",
  hasUpdate: false,
  official: false,
  installed: true,
};

describe("ExtensionsSettingsView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders official and user extensions with their badges", async () => {
    mocked.listExtensions.mockResolvedValue([OFFICIAL, USER]);

    render(<ExtensionsSettingsView />);

    expect(await screen.findByText("@yishan-io/pi-notify")).toBeTruthy();
    expect(screen.getByText("pi-web-fetch")).toBeTruthy();
    expect(screen.getByText("v1.2.3")).toBeTruthy();
  });

  it("shows no remove button for official extensions (update stays)", async () => {
    mocked.listExtensions.mockResolvedValue([OFFICIAL, USER]);

    render(<ExtensionsSettingsView />);

    await screen.findByText("@yishan-io/pi-notify");
    const officialRow = screen.getByTestId("extension-row-@yishan-io/pi-notify");
    expect(within(officialRow).queryByText("settings.customize.extensions.actions.remove")).toBeNull();
    expect(within(officialRow).getByText("settings.customize.extensions.actions.update")).toBeTruthy();

    const userRow = screen.getByTestId("extension-row-pi-web-fetch");
    expect(within(userRow).getByText("settings.customize.extensions.actions.remove")).toBeTruthy();
  });

  it("shows no remove button for local-file extension entries", async () => {
    mocked.listExtensions.mockResolvedValue([LOCAL_FILE]);

    render(<ExtensionsSettingsView />);

    expect(await screen.findByText("local-ext.ts")).toBeTruthy();
    const row = screen.getByTestId("extension-row-local-ext.ts");
    expect(row).toBeTruthy();
    // The remove button is gated by source: local-file entries have none.
    expect(screen.queryByText("settings.customize.extensions.actions.remove")).toBeNull();
  });

  it("add dialog installs the entered source", async () => {
    mocked.listExtensions.mockResolvedValue([OFFICIAL]);
    mocked.installExtension.mockResolvedValueOnce(undefined);

    render(<ExtensionsSettingsView />);

    await screen.findByText("@yishan-io/pi-notify");
    fireEvent.click(screen.getByTestId("add-extension-button"));
    const input = screen.getByPlaceholderText("settings.customize.extensions.dialogs.add.placeholder");
    fireEvent.change(input, { target: { value: "npm:pi-web-fetch" } });
    fireEvent.click(screen.getByText("settings.customize.extensions.dialogs.add.install"));

    await waitFor(() => expect(mocked.installExtension).toHaveBeenCalledWith("npm:pi-web-fetch"));
  });

  it("remove requires confirmation before calling the command", async () => {
    mocked.listExtensions.mockResolvedValue([USER]);

    render(<ExtensionsSettingsView />);

    await screen.findByText("pi-web-fetch");
    fireEvent.click(screen.getByText("settings.customize.extensions.actions.remove"));

    expect(mocked.removeExtension).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("settings.customize.extensions.dialogs.remove.confirm"));

    await waitFor(() => expect(mocked.removeExtension).toHaveBeenCalledWith("npm:pi-web-fetch"));
  });

  it("update calls the update command with the source spec", async () => {
    mocked.listExtensions.mockResolvedValue([OFFICIAL]);
    mocked.updateExtension.mockResolvedValueOnce(undefined);

    render(<ExtensionsSettingsView />);

    await screen.findByText("@yishan-io/pi-notify");
    fireEvent.click(screen.getByText("settings.customize.extensions.actions.update"));

    await waitFor(() => expect(mocked.updateExtension).toHaveBeenCalledWith("npm:@yishan-io/pi-notify"));
  });

  it("shows the latest version and update only when a new version is available", async () => {
    mocked.listExtensions.mockResolvedValue([OFFICIAL, USER]);

    render(<ExtensionsSettingsView />);

    await screen.findByText("@yishan-io/pi-notify");
    // Official has a newer version: latest shown, update button present.
    expect(screen.getByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("v2.0.0")).toBeTruthy();
    expect(screen.getAllByText("settings.customize.extensions.actions.update").length).toBeGreaterThan(0);
    // User is up to date: no latest version, no update button.
    const userRow = screen.getByTestId("extension-row-pi-web-fetch");
    expect(within(userRow).queryByText("settings.customize.extensions.actions.update")).toBeNull();
    expect(within(userRow).queryByText(/v0\.5/)).toBeNull();
  });
});
