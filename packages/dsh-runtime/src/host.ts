import { mkdir } from "node:fs/promises";

import { Context } from "@deepseek-ai/cordis";
import { type BridgeHostConfig, apply as applyDaemonBridge } from "@yishan-io/dsh-daemon-bridge";
import * as providerPlugin from "@yishan-io/dsh-provider";
import * as sessionPlugin from "@yishan-io/dsh-session";
import * as workspacePlugin from "@yishan-io/dsh-workspace";

import { resolveDataDirectory } from "./config";
import { installCorePlugins } from "./corePlugins";
import { loadPlugins } from "./plugins";
import type { PluginLoadState } from "./private/plugin-loader";

/** Configuration for the production DSH runtime composition. */
export type RuntimeConfig = BridgeHostConfig & {
  /** Directory that owns durable session and plugin state. */
  dataDirectory?: string;
};

/** Owns one fully composed DSH runtime and its Cordis lifecycle. */
export class RuntimeHost {
  private closeTask: Promise<void> | undefined;

  private constructor(
    /** The composed Cordis service context. */
    public readonly context: Context,
    /** Deterministic verified official plugin-entry outcomes for this runtime. */
    public readonly pluginStates: readonly PluginLoadState[],
  ) {}

  /** Composes every first-party package before opening the daemon bridge. */
  static async create(config: RuntimeConfig = {}): Promise<RuntimeHost> {
    const dataDirectory = resolveDataDirectory(config);
    await mkdir(dataDirectory, { recursive: true });

    const context = new Context();
    try {
      await context.plugin(applyDaemonBridge, config);
      await installCorePlugins(context);
      await context.plugin(providerPlugin, { dataDirectory });
      await context.plugin(workspacePlugin);
      await context.plugin(sessionPlugin, { dataDirectory });
      const plugins = await loadPlugins(context, dataDirectory);
      context.daemonBridge.start();
      return new RuntimeHost(context, plugins.states);
    } catch (startupError) {
      await RuntimeHost.cleanupFailedStartup(context, startupError);
      throw startupError;
    }
  }

  /** Disposes the complete runtime graph exactly once. */
  close(): Promise<void> {
    this.closeTask ??= this.context.root.fiber.dispose();
    return this.closeTask;
  }

  private static async cleanupFailedStartup(context: Context, startupError: unknown): Promise<void> {
    try {
      await context.root.fiber.dispose();
    } catch (cleanupError) {
      throw new AggregateError([startupError, cleanupError], "failed to clean up DSH runtime startup");
    }
  }
}
