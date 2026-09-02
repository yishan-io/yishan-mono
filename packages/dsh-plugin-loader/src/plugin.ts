import { type Context, Service } from "@deepseek-ai/cordis";

import { type PluginLoadState, mountLocalPluginLoader, mountVerifiedPluginLoader } from "./loader";

/** Cordis plugin name for verified and developer-local DSH plugins. */
export const name = "dsh-plugin-loader";

/** Configuration for one daemon-managed plugin root. */
export type PluginLoaderConfig = {
  pluginRoot: string;
  developerMode: boolean;
};

declare module "@deepseek-ai/cordis" {
  interface Context {
    yishanPluginLoader: PluginLoaderService;
  }
}

/** Exposes deterministic plugin load outcomes to the runtime host. */
export class PluginLoaderService extends Service {
  constructor(
    context: Context,
    /** Official outcomes followed by developer-local outcomes. */
    public readonly states: readonly PluginLoadState[],
  ) {
    super(context, "yishanPluginLoader");
  }
}

/** Loads verified official plugins before optional developer-local plugins. */
export async function apply(context: Context, config: PluginLoaderConfig): Promise<void> {
  const officialPlugins = await mountVerifiedPluginLoader(context, config.pluginRoot);
  const localPlugins = config.developerMode
    ? await mountLocalPluginLoader(context, config.pluginRoot)
    : { states: [] as const };
  new PluginLoaderService(context, [...officialPlugins.states, ...localPlugins.states]);
}
