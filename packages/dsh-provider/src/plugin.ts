import { type Context, Service } from "@deepseek-ai/cordis";
import * as deepSeekOfficial from "@deepseek-ai/dsh-llm-deepseek";
import * as piAi from "@deepseek-ai/dsh-llm-pi-ai";

import { YISHAN_METHODS } from "@yishan-io/dsh-daemon-bridge";

import {
  type ProviderCatalog,
  type ProviderContextWindowRoute,
  YISHAN_PI_AI_CONFIG,
  assertPiAiProviderManifest,
  listProviderContextWindows,
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

  /** Lists valid context capacities for requested active provider/model routes. */
  async listContextWindows(routes: unknown) {
    return await listProviderContextWindows(this.context.llm, parseProviderContextWindowRoutes(routes));
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
    [YISHAN_METHODS.providerContextWindows]: async ({ routes }) => await catalog.listContextWindows(routes),
  });
  context.effect(() => unregister, `${name}.route`);
}

/** Validates untyped bridge input before context capacities reach the catalog service. */
function parseProviderContextWindowRoutes(value: unknown): ProviderContextWindowRoute[] {
  if (!Array.isArray(value)) throw new TypeError("invalid provider context window routes");
  const routes: ProviderContextWindowRoute[] = [];
  for (const route of value) {
    if (!isProviderContextWindowRoute(route)) throw new TypeError("invalid provider context window routes");
    routes.push(route);
  }
  return routes;
}

function isProviderContextWindowRoute(value: unknown): value is ProviderContextWindowRoute {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("provider") || !keys.includes("model")) return false;
  const { provider, model } = value as { provider: unknown; model: unknown };
  return typeof provider === "string" && provider.length > 0 && typeof model === "string" && model.length > 0;
}
