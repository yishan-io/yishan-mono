import type { Context } from "@deepseek-ai/cordis";

import { RpcServer, type RuntimeServerConfig } from "./server";

/** Cordis plugin name for the Yishan-owned SDK JSON-RPC stdio server. */
export const name = "yishan-sdk-jsonrpc-server";
/** Session history and agent lifecycle services are required at activation. */
export const inject = ["agents", "llm", "sessionQuery", "sessions", "sessionPersistence", "subagents"];

/** Mounts the Yishan-owned SDK JSON-RPC stdio server. */
export function apply(ctx: Context, config: RuntimeServerConfig = {}): void {
  const server = new RpcServer(ctx, config);
  ctx.effect(() => {
    server.start();
    return async () => await server.close();
  }, "yishan-jsonrpc.serve");
}

export type { RuntimeServerConfig } from "./server";
