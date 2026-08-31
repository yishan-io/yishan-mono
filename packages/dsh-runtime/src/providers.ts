import type { Context } from "@deepseek-ai/cordis";
import * as deepSeekOfficial from "@deepseek-ai/dsh-llm-deepseek";
import * as piAi from "@deepseek-ai/dsh-llm-pi-ai";

import { YISHAN_METHODS } from "@yishan-io/dsh-daemon-bridge";
import type { ValidateModelSelection } from "@yishan-io/dsh-session";

import { installCredentialsPlugin } from "./private/provider";
import {
  YISHAN_PI_AI_CONFIG,
  assertPiAiProviderManifest,
  listProviders,
  validateProviderSelection,
} from "./private/provider";

/** Installs Yishan credential resolution and its fixed LLM provider catalog. */
export async function installProviders(context: Context, dataDirectory: string): Promise<void> {
  installCredentialsPlugin(context, dataDirectory);
  assertPiAiProviderManifest();
  await context.plugin(deepSeekOfficial);
  // dsh-llm-pi-ai's internal configurable-provider metadata always mirrors pi-ai's
  // full built-in catalog. It is not Yishan's active route registry or an external
  // RPC/catalog surface. Config restricts registered routes, and no ctx.settings
  // service is mounted, so this metadata cannot activate an additional route.
  await context.plugin(piAi, YISHAN_PI_AI_CONFIG);
  const unregister = context.daemonBridge.registerHandlers("dsh-runtime-provider", {
    [YISHAN_METHODS.providersList]: async () => await listProviders(context.llm),
  });
  context.effect(() => unregister, "dsh-runtime-provider.route");
}

/** Validates one session model selection against the runtime-private catalog. */
export async function validateModelSelection(
  context: Context,
  selection: Parameters<ValidateModelSelection>[0],
): Promise<void> {
  await validateProviderSelection(context.llm, selection);
}
