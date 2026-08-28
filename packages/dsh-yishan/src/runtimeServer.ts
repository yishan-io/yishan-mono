import type { Readable, Writable } from "node:stream";

import type { Context } from "@deepseek-ai/cordis";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-subagent";

import { parseStockSessionPromptRequest } from "./executionContracts";
import { listYishanProviders, validateYishanProviderSelection } from "./llmProviders";
import { YISHAN_METHODS } from "./protocol";
import { createRequestRouter } from "./requestRouter";
import { YishanSessionExecutionOwner } from "./sessionExecutionOwner";
import { createSessionHandler } from "./sessionHandler";
import { createSubagentInterruptHandler } from "./subagentInterruptHandler";
import { installSubagentLifecycleNotifications } from "./subagentLifecycle";

/** Cordis plugin name for the Yishan-owned SDK JSON-RPC stdio server. */
export const name = "yishan-sdk-jsonrpc-server";
/** Session history and agent lifecycle services are required at activation. */
export const inject = ["agents", "llm", "sessionQuery", "sessions", "sessionPersistence", "subagents"];

/** Runtime-only stream hooks used by packaged launchers and tests. */
export type YishanRuntimeServerConfig = {
  input?: Readable;
  output?: Writable;
  exit?: (code: number) => void;
};

/** Mounts stock SDK methods and Yishan session extensions on one stdio owner. */
export function apply(ctx: Context, config: YishanRuntimeServerConfig = {}): void {
  const input = config.input ?? process.stdin;
  const output = config.output ?? process.stdout;
  const exit = config.exit ?? ((code: number): void => process.exit(code));
  const transport = new JsonRpcLineTransport(input, output);
  const stock = new HarnessSdkJsonRpcServer(ctx, transport);
  const owner = new YishanSessionExecutionOwner({
    agents: {
      get: (sessionId) => ctx.agents.get(sessionId as SessionId),
      create: async (options) => await ctx.agents.create({ ...options, sessionId: options.sessionId as SessionId }),
      resume: async (options) =>
        await ctx.agents.resume({ ...options, resumeSessionId: options.resumeSessionId as SessionId }),
    },
    sessions: {
      get: (sessionId) => ctx.sessions.get(sessionId as SessionId),
      flush: async (session) => await ctx.sessions.flush(session as never),
    },
    sessionPersistence: {
      readFrom: async (sessionId, fromSeq) => await ctx.sessionPersistence.readFrom(sessionId as SessionId, fromSeq),
    },
    notify: (method, params) => transport.notify(method as never, params as never),
    validateProviderSelection: async (selection) => await validateYishanProviderSelection(ctx.llm, selection),
  });
  installSubagentLifecycleNotifications(ctx, {
    incarnation: owner.getIncarnation(),
    notify: (method, payload) => transport.notify(method as never, payload as never),
  });
  let shutdownTask: Promise<Record<string, never>> | undefined;
  let isInitialized = false;

  const sessions = createSessionHandler({
    sessionQuery: ctx.sessionQuery,
    resumeSession: async (sessionId) => await owner.resume({ sessionId, cwd: "" }),
    disposeSession: async (sessionId) => await owner.disposeSession({ sessionId, cwd: "" }),
    subagents: ctx.subagents,
    execution: owner,
  });
  const interruptSubagent = createSubagentInterruptHandler({
    execution: owner,
    sessionQuery: ctx.sessionQuery,
    subagents: ctx.subagents,
  });
  const route = createRequestRouter(
    async (method, params) => {
      if (method === "session/prompt" && typeof params.sessionId === "string" && owner.owns(params.sessionId)) {
        const prompt = parseStockSessionPromptRequest(params);
        return await owner.stockPrompt(prompt.sessionId, prompt.contentBlocks);
      }
      return await stock.handleRequest(method, params);
    },
    sessions,
    (sessionId) => owner.owns(sessionId),
  );

  ctx.on("session/event", (session, event) => owner.handleSessionEvent(session, event));

  transport.onRequest(async (method, params) => {
    if (method === "initialize") {
      await ctx.get("loader")?.await();
      const result = await stock.handleRequest(method, params);
      owner.setInitializeOptions(getInitializeOptions(params));
      isInitialized = true;
      return result;
    }
    if (method === YISHAN_METHODS.providersList) return await listYishanProviders(ctx.llm);
    if (method === "shutdown") {
      shutdownTask ??= shutdownRuntime(owner, stock);
      const result = await shutdownTask;
      setImmediate(() => void disposeAndExit(ctx, transport, exit));
      return result;
    }
    if (!isInitialized && isExecutionExtension(method)) {
      throw new Error("initialize must succeed before session execution");
    }
    if (method === YISHAN_METHODS.subagentInterrupt) return await interruptSubagent(params);
    return await route(method, params);
  });

  ctx.effect(() => {
    transport.start();
    return async () => {
      shutdownTask ??= shutdownRuntime(owner, stock);
      await shutdownTask;
      transport.close();
    };
  }, "yishan-jsonrpc.serve");
}

async function shutdownRuntime(
  owner: YishanSessionExecutionOwner,
  stock: HarnessSdkJsonRpcServer,
): Promise<Record<string, never>> {
  const results = await Promise.allSettled([owner.dispose(), stock.shutdown()]);
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

function getInitializeOptions(params: Record<string, unknown>): {
  provider?: string;
  model?: string;
  maxTokens?: number;
} {
  return {
    ...(typeof params.provider === "string" ? { provider: params.provider } : {}),
    ...(typeof params.model === "string" ? { model: params.model } : {}),
    ...(typeof params.maxTokens === "number" ? { maxTokens: params.maxTokens } : {}),
  };
}

function isExecutionExtension(method: string): boolean {
  return new Set<string>([
    YISHAN_METHODS.start,
    YISHAN_METHODS.setModel,
    YISHAN_METHODS.prompt,
    YISHAN_METHODS.cancel,
    YISHAN_METHODS.subscribe,
    YISHAN_METHODS.flush,
    YISHAN_METHODS.resume,
    YISHAN_METHODS.dispose,
    YISHAN_METHODS.subagentInterrupt,
  ]).has(method);
}
