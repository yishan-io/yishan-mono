import { Context } from "@deepseek-ai/cordis";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loaderMocks = vi.hoisted(() => ({
  mountVerified: vi.fn(),
  mountLocal: vi.fn(),
}));

vi.mock("./loader", () => ({
  mountVerifiedPluginLoader: loaderMocks.mountVerified,
  mountLocalPluginLoader: loaderMocks.mountLocal,
}));

import { apply } from "./plugin";

beforeEach(() => {
  loaderMocks.mountVerified.mockReset().mockResolvedValue({
    states: [{ id: "official", packageName: "official-plugin", state: "loaded" }],
  });
  loaderMocks.mountLocal.mockReset().mockResolvedValue({
    states: [{ id: "local", packageName: "local-plugin", state: "loaded" }],
  });
});

describe("dsh plugin loader composition", () => {
  it("exposes official states before developer-local states", async () => {
    const context = new Context();

    await apply(context, { pluginRoot: "/plugins", developerMode: true });

    expect(context.yishanPluginLoader.states.map(({ id }) => id)).toEqual(["official", "local"]);
    expect(loaderMocks.mountVerified).toHaveBeenCalledWith(context, "/plugins");
    expect(loaderMocks.mountLocal).toHaveBeenCalledWith(context, "/plugins");
    await context.fiber.dispose();
  });

  it("does not inspect the local lock outside developer mode", async () => {
    const context = new Context();

    await apply(context, { pluginRoot: "/plugins", developerMode: false });

    expect(context.yishanPluginLoader.states.map(({ id }) => id)).toEqual(["official"]);
    expect(loaderMocks.mountLocal).not.toHaveBeenCalled();
    await context.fiber.dispose();
  });
});
