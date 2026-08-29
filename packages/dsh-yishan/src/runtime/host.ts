import { mkdir } from "node:fs/promises";

import { Context } from "@deepseek-ai/cordis";

import type { PluginLoadState } from "../plugin-loader/loader";
import * as rpcPlugin from "../rpc-server/plugin";
import { resolveDataDirectory } from "./config";
import { installCoreServices } from "./core";
import { loadPlugins } from "./plugins";
import { installProviders } from "./providers";

/** Configuration for the programmatic Yishan production DSH runtime. */
export type RuntimeConfig = rpcPlugin.RuntimeServerConfig & {
  /** Directory that owns durable JSONL session logs and the derived SQLite query index. */
  dataDirectory?: string;
};

/** Owns one fully composed Yishan DSH runtime and its resource lifecycle. */
export class RuntimeHost {
  private closeTask: Promise<void> | undefined;

  private constructor(
    /** The composed Cordis service context. */
    public readonly context: Context,
    /** Deterministic verified official plugin-entry outcomes for this runtime. */
    public readonly pluginStates: readonly PluginLoadState[],
  ) {}

  /** Creates the fixed production service graph without YAML or plugin resolution. */
  static async create(config: RuntimeConfig = {}): Promise<RuntimeHost> {
    const dataDirectory = resolveDataDirectory(config);
    await mkdir(dataDirectory, { recursive: true });

    const context = new Context();
    try {
      await installCoreServices(context, dataDirectory);
      await installProviders(context, dataDirectory);
      const plugins = await loadPlugins(context, dataDirectory);
      await context.plugin(rpcPlugin, config);
      return new RuntimeHost(context, plugins.states);
    } catch (startupError) {
      await RuntimeHost.cleanupFailedStartup(context, startupError);
      throw startupError;
    }
  }

  /** Disposes every runtime service after draining durable session writes. */
  close(): Promise<void> {
    this.closeTask ??= this.context.fiber.dispose();
    return this.closeTask;
  }

  private static async cleanupFailedStartup(context: Context, startupError: unknown): Promise<void> {
    try {
      await context.fiber.dispose();
    } catch (cleanupError) {
      throw new AggregateError([startupError, cleanupError], "failed to clean up DSH runtime startup");
    }
  }
}
