import type { Readable, Writable } from "node:stream";

import type { Context } from "@deepseek-ai/cordis";
import type { AgentHandle } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
import type { SessionPromptParams } from "@deepseek-ai/dsh-sdk-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session";

import { createRequestRouter } from "./requestRouter";
import { createSessionHandler } from "./sessionHandler";

/** Cordis plugin name for the Yishan-owned SDK JSON-RPC stdio server. */
export const name = "yishan-sdk-jsonrpc-server";
/** Session history and agent lifecycle services are required at activation. */
export const inject = ["agents", "sessionQuery"];

/** Runtime-only stream hooks used by packaged launchers and tests. */
export type YishanRuntimeServerConfig = {
  input?: Readable;
  output?: Writable;
  exit?: (code: number) => void;
};

export class ResumedSessionOwner {
  private readonly handles = new Map<string, AgentHandle>();
  private readonly tasks = new Map<string, Promise<void>>();

  constructor(private readonly ctx: Context) {}

  async resume(sessionId: SessionId): Promise<void> {
    if (this.ctx.agents.get(sessionId) !== undefined) return;
    const key = String(sessionId);
    const active = this.tasks.get(key);
    if (active !== undefined) return active;
    const task = this.resumeOwned(sessionId, key);
    this.tasks.set(key, task);
    return task;
  }

  async disposeSession(sessionId: SessionId): Promise<boolean> {
    const key = String(sessionId);
    await this.tasks.get(key);
    const handle = this.handles.get(key);
    if (handle === undefined) return false;
    this.handles.delete(key);
    await handle.dispose();
    return true;
  }

  async prompt(params: SessionPromptParams): Promise<{ messageId: string } | undefined> {
    const agent = this.handles.get(params.sessionId)?.agent ?? this.ctx.agents.get(params.sessionId as SessionId);
    if (agent === undefined) return undefined;
    const message = createUserMessage({ content: params.contentBlocks, source: { kind: "user" } });
    agent.followup(message);
    return { messageId: message.id };
  }

  async dispose(): Promise<void> {
    const taskResults = await Promise.allSettled(this.tasks.values());
    const handles = [...this.handles.values()];
    this.handles.clear();
    const handleResults = await Promise.allSettled(handles.map(async (handle) => await handle.dispose()));
    const failures = [...taskResults, ...handleResults]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason as unknown);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "failed to dispose resumed DSH sessions");
  }

  private async resumeOwned(sessionId: SessionId, key: string): Promise<void> {
    try {
      const handle = await this.ctx.agents.resume({ resumeSessionId: sessionId });
      this.handles.set(key, handle);
    } finally {
      this.tasks.delete(key);
    }
  }
}

/** Mounts stock SDK methods and Yishan session extensions on one stdio owner. */
export function apply(ctx: Context, config: YishanRuntimeServerConfig = {}): void {
  const input = config.input ?? process.stdin;
  const output = config.output ?? process.stdout;
  const exit = config.exit ?? ((code: number): void => process.exit(code));
  const transport = new JsonRpcLineTransport(input, output);
  const stock = new HarnessSdkJsonRpcServer(ctx, transport);
  const resumed = new ResumedSessionOwner(ctx);
  let shutdownTask: Promise<Record<string, never>> | undefined;

  const sessions = createSessionHandler({
    sessionQuery: ctx.sessionQuery,
    resumeSession: async (sessionId) => await resumed.resume(sessionId),
    disposeSession: async (sessionId) => await resumed.disposeSession(sessionId),
  });
  const route = createRequestRouter(async (method, params) => {
    if (method === "session/prompt") {
      const result = await resumed.prompt(params as unknown as SessionPromptParams);
      if (result !== undefined) return result;
    }
    return await stock.handleRequest(method, params);
  }, sessions);

  transport.onRequest(async (method, params) => {
    if (method === "initialize") {
      await ctx.get("loader")?.await();
      return await stock.handleRequest(method, params);
    }
    if (method === "shutdown") {
      shutdownTask ??= shutdownRuntime(resumed, stock);
      const result = await shutdownTask;
      setImmediate(() => void disposeAndExit(ctx, transport, exit));
      return result;
    }
    return await route(method, params);
  });

  ctx.effect(() => {
    transport.start();
    return async () => {
      shutdownTask ??= shutdownRuntime(resumed, stock);
      await shutdownTask;
      transport.close();
    };
  }, "yishan-jsonrpc.serve");
}

async function shutdownRuntime(
  resumed: ResumedSessionOwner,
  stock: HarnessSdkJsonRpcServer,
): Promise<Record<string, never>> {
  const results = await Promise.allSettled([resumed.dispose(), stock.shutdown()]);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason as unknown);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "failed to shut down DSH runtime");
  return {};
}

async function disposeAndExit(
  ctx: Context,
  transport: JsonRpcLineTransport,
  exit: (code: number) => void,
): Promise<void> {
  await Promise.allSettled([transport.flush()]);
  await Promise.allSettled([ctx.root.fiber.dispose()]);
  exit(0);
}
