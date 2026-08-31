import { type Context, Service } from "@deepseek-ai/cordis";
import * as deepSeekOfficial from "@deepseek-ai/dsh-llm-deepseek";
import * as piAi from "@deepseek-ai/dsh-llm-pi-ai";

import { YISHAN_METHODS } from "@yishan-io/dsh-daemon-bridge";

import {
  type ProviderCatalog,
  YISHAN_PI_AI_CONFIG,
  assertPiAiProviderManifest,
  listProviders,
  validateProviderSelection,
} from "./catalog";
import { installCredentialsPlugin } from "./credentials";
import { installDshTestReplayAdapter, isDshTestReplayEnabled } from "./replay";

/** Cordis plugin name for Yishan's provider catalog and adapters. */
export const name = "dsh-provider";
/** Provider composition requires the shared LLM runtime and daemon bridge. */
export const inject = ["daemonBridge", "llm"];

/** Configuration for account-scoped provider state. */
export type ProviderPluginConfig = { dataDirectory: string };
/** One exact model route selected for session execution. */
export type ModelSelection = { provider: string; model: string };

declare module "@deepseek-ai/cordis" {
  interface Context {
    yishanProviderCatalog: ProviderCatalogService;
  }
}

/** Exposes the active Yishan provider catalog to first-party plugins. */
export class ProviderCatalogService extends Service {
  private readonly context: Context;

  constructor(context: Context) {
    super(context, "yishanProviderCatalog");
    this.context = context;
  }

  /** Lists provider/model routes exposed by Yishan. */
  async list(): Promise<ProviderCatalog> {
    return await listProviders(this.context.llm);
  }

  /** Rejects a model selection outside the active Yishan catalog. */
  async validateSelection(selection: ModelSelection): Promise<void> {
    await validateProviderSelection(this.context.llm, selection);
  }
}

/** Installs credentials, adapters, catalog service, and its bridge route. */
export async function apply(context: Context, config: ProviderPluginConfig): Promise<void> {
  installCredentialsPlugin(context, config.dataDirectory);
  assertPiAiProviderManifest();
  await context.plugin(deepSeekOfficial);
  // pi-ai exposes metadata for its full built-in catalog. This config alone
  // determines the routes registered in Yishan's active LLM runtime.
  await context.plugin(piAi, YISHAN_PI_AI_CONFIG);
  if (isDshTestReplayEnabled()) installDshTestReplayAdapter(context);

  const catalog = new ProviderCatalogService(context);
  const unregister = context.daemonBridge.registerHandlers(name, {
    [YISHAN_METHODS.providersList]: async () => await catalog.list(),
  });
  context.effect(() => unregister, `${name}.route`);
}
