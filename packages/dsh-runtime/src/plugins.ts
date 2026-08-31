import type { Context } from "@deepseek-ai/cordis";

import {
  type PluginLoadState,
  mountLocalPluginLoader,
  mountVerifiedPluginLoader,
} from "@yishan-io/dsh-yishan/plugin-loader";
import { isDeveloperMode } from "./config";

/** Deterministic official and developer-local plugin outcomes for one runtime. */
export type PluginLoadReport = { states: readonly PluginLoadState[] };

/** Loads verified official plugins before Developer Mode local plugins. */
export async function loadPlugins(context: Context, dataDirectory: string): Promise<PluginLoadReport> {
  const officialPlugins = await mountVerifiedPluginLoader(context, dataDirectory);
  const localPlugins = isDeveloperMode() ? await mountLocalPluginLoader(context, dataDirectory) : { states: [] };
  return { states: [...officialPlugins.states, ...localPlugins.states] };
}
