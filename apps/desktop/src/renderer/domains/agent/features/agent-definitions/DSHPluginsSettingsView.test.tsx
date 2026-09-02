// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dshPluginStore } from "../../state/dshPluginStore";
import { DSHPluginsSettingsView } from "./DSHPluginsSettingsView";

const commands = vi.hoisted(() => ({ install: vi.fn(), load: vi.fn() }));

vi.mock("../../commands/dshPluginCommands", () => ({
  changeDSHPluginEnabled: vi.fn(),
  deleteDSHPlugin: vi.fn(),
  installDSHPlugin: commands.install,
  loadDSHPlugins: commands.load,
  refreshDSHPlugin: vi.fn(),
}));

describe("DSHPluginsSettingsView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    commands.load.mockResolvedValue(undefined);
    dshPluginStore.setState({ bundles: [], officialBundles: [], isLoading: false, error: null });
  });

  afterEach(cleanup);

  it("shows an empty audited catalog as no compatible official bundles", () => {
    render(<DSHPluginsSettingsView />);

    expect(screen.getByRole("button", { name: "No official DSH Loader bundles available" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not offer online updates for an installed offline-only bundle", () => {
    dshPluginStore.setState({
      bundles: [{ name: "@yishan-io/dsh-dev-flow", version: "0.1.0", enabled: true }],
      officialBundles: [],
    });
    render(<DSHPluginsSettingsView />);

    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).not.toBeNull();
  });

  it("installs a selected audited catalog entry without a user package specifier", async () => {
    dshPluginStore.setState({ officialBundles: [{ name: "@deepseek-ai/dsh-base", version: "0.1.1-rc.2" }] });
    render(<DSHPluginsSettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "Install @deepseek-ai/dsh-base" }));

    await waitFor(() => expect(commands.install).toHaveBeenCalledWith("@deepseek-ai/dsh-base"));
  });
});
