import { beforeEach, describe, expect, it, vi } from "vitest";
import { dshPluginStore } from "../state/dshPluginStore";
import { changeDSHPluginEnabled, installDSHPlugin, loadDSHPlugins } from "./dshPluginCommands";

const mocks = vi.hoisted(() => ({ list: vi.fn(), listOfficial: vi.fn(), install: vi.fn(), setEnabled: vi.fn() }));

vi.mock("../daemon/daemonAgentProcedures", () => ({
  listDSHPlugins: mocks.list,
  listOfficialDSHPlugins: mocks.listOfficial,
  installOfficialDSHPlugin: mocks.install,
  setDSHPluginEnabled: mocks.setEnabled,
  removeDSHPlugin: vi.fn(),
  updateDSHPlugin: vi.fn(),
}));

describe("DSH plugin commands", () => {
  beforeEach(() => {
    dshPluginStore.setState({ bundles: [], officialBundles: [], isLoading: false, error: null });
    vi.resetAllMocks();
    mocks.listOfficial.mockResolvedValue({ bundles: [] });
  });

  it("loads only bounded valid bundle DTOs into the store", async () => {
    mocks.list.mockResolvedValue({ bundles: [{ name: "safe", version: "1.0.0", enabled: true }, { name: 4 }] });
    mocks.listOfficial.mockResolvedValue({
      bundles: [
        { name: "@deepseek-ai/dsh-base", version: "0.1.1-rc.2" },
        { name: "@deepseek-ai/dsh-headless", version: "0.1.1-rc.2" },
        { name: "@deepseek-ai/dsh-web-app", version: "0.1.1-rc.2" },
        { name: 4 },
      ],
    });

    await loadDSHPlugins();

    expect(dshPluginStore.getState().bundles).toEqual([{ name: "safe", version: "1.0.0", enabled: true }]);
    expect(dshPluginStore.getState().officialBundles).toEqual([
      { name: "@deepseek-ai/dsh-base", version: "0.1.1-rc.2" },
      { name: "@deepseek-ai/dsh-headless", version: "0.1.1-rc.2" },
      { name: "@deepseek-ai/dsh-web-app", version: "0.1.1-rc.2" },
    ]);
  });

  it("updates enablement through the daemon then reloads the signed inventory", async () => {
    mocks.setEnabled.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue({ bundles: [{ name: "safe", version: "1.0.0", enabled: false }] });

    await changeDSHPluginEnabled("safe", false);

    expect(mocks.setEnabled).toHaveBeenCalledWith({ name: "safe", enabled: false });
    expect(dshPluginStore.getState().bundles[0]?.enabled).toBe(false);
  });

  it("installs only a daemon-selected catalog entry name", async () => {
    mocks.install.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue({ bundles: [{ name: "safe", version: "1.0.0", enabled: true }] });

    await installDSHPlugin("safe");

    expect(mocks.install).toHaveBeenCalledWith({ name: "safe" });
  });
});
