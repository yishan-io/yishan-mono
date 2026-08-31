import type { Context } from "@deepseek-ai/cordis";
import * as deepSeekOfficial from "@deepseek-ai/dsh-llm-deepseek";
import * as piAi from "@deepseek-ai/dsh-llm-pi-ai";

import { installCredentialsPlugin } from "@yishan-io/dsh-yishan/provider";
import { YISHAN_PI_AI_CONFIG, assertPiAiProviderManifest } from "@yishan-io/dsh-yishan/provider";

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
}
