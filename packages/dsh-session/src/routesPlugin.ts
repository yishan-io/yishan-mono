import type { Context } from "@deepseek-ai/cordis";
import { type BridgeRequestHandler, YISHAN_METHODS } from "@yishan-io/dsh-daemon-bridge";

import { SessionRequestHandler } from "./requestHandler";
import type { ValidateModelSelection } from "./session/runtime";

/** Cordis plugin name for session bridge routes. */
export const name = "dsh-session-routes";
/** Route handlers require the services installed by the session package. */
export const inject = [
  "daemonBridge",
  "agents",
  "llm",
  "sessions",
  "sessionPersistence",
  "sessionQuery",
  "subagents",
  "yishanWorkspaceBindingHost",
];

/** Route plugin configuration supplied by the session package. */
export type SessionRoutesConfig = { validateModelSelection: ValidateModelSelection };

const SESSION_METHODS = [
  YISHAN_METHODS.start,
  YISHAN_METHODS.setModel,
  YISHAN_METHODS.prompt,
  YISHAN_METHODS.cancel,
  YISHAN_METHODS.subscribe,
  YISHAN_METHODS.flush,
  YISHAN_METHODS.resume,
  YISHAN_METHODS.dispose,
  YISHAN_METHODS.list,
  YISHAN_METHODS.read,
  YISHAN_METHODS.lineage,
  YISHAN_METHODS.subagentInterrupt,
  "session/new",
  "session/prompt",
] as const;

/** Installs session request routes after all required services are visible. */
export function apply(context: Context, config: SessionRoutesConfig): void {
  const handler = new SessionRequestHandler(context, context.daemonBridge, config.validateModelSelection);
  const unregisterRoutes = registerSessionRoutes(context, handler);
  context.effect(
    () => async () => {
      unregisterRoutes();
      await handler.close();
    },
    "dsh-session.routes",
  );
}

/** Registers one session handler with the already-installed daemon bridge. */
export function registerSessionRoutes(context: Context, handler: SessionRequestHandler): () => void {
  const handlers: Record<string, BridgeRequestHandler> = {};
  for (const method of SESSION_METHODS) {
    handlers[method] = async (params) => await handler.handle(method, params);
  }
  const unregisterHandlers = context.daemonBridge.registerHandlers(name, handlers);
  const unregisterInitialize = context.daemonBridge.registerInitializeHook(name, async (params) => {
    await handler.initialize(params);
  });
  const unregisterShutdown = context.daemonBridge.registerShutdownHook(name, async () => {
    await handler.close();
  });
  return () => {
    unregisterShutdown();
    unregisterInitialize();
    unregisterHandlers();
  };
}
