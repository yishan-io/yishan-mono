import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createCliMemoryClient } from "./backend/cliMemoryClient";
import { createInjectedMemoryContextBuilder } from "./context/buildInjectedMemoryContext";
import { registerMemoryTools } from "./tools/registerMemoryTools";

/**
 * Registers Pi memory integration for Yishan-backed sessions.
 */
export function createPiMemoryExtension(pi: ExtensionAPI): void {
  const memoryClient = createCliMemoryClient();
  const contextBuilder = createInjectedMemoryContextBuilder();
  let hasInjectedSessionContext = false;

  registerMemoryTools(pi, memoryClient);

  pi.on("session_start", async () => {
    hasInjectedSessionContext = false;
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (hasInjectedSessionContext) {
      return undefined;
    }

    const content = contextBuilder.build({ projectRoot: ctx.cwd });
    if (!content) {
      return undefined;
    }

    hasInjectedSessionContext = true;
    return {
      message: {
        customType: "pi-memory-context",
        content,
        display: false,
      },
    };
  });

  pi.on("session_shutdown", async () => {
    hasInjectedSessionContext = false;
  });
}
