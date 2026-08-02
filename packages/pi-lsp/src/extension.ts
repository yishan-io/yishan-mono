/**
 * Pi extension entry: wires the LSP tools, the /lsp command, and session
 * status handling.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadRuntime } from "./config/config";
import { effectivePath, isCommandAvailable } from "./helpers/commands";
import { STATUS_KEY, registerLspTools } from "./tools/registerLspTools";
import type { ResolvedServer } from "./types";

/**
 * Creates the pi-lsp extension on the Pi API.
 */
export function createPiLspExtension(pi: ExtensionAPI): void {
  registerLspTools(pi);

  pi.registerCommand("lsp", {
    description: "Show configured LSP commands and whether each is available on PATH.",
    handler: async (_args, ctx) => {
      try {
        const runtime = loadRuntime(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
        ctx.ui.notify(buildStatusMessage(runtime.servers, ctx.cwd), statusLevel(runtime.servers, ctx.cwd));
      } catch (error) {
        ctx.ui.notify(`LSP config ignored: ${describeError(error)}`, "warning");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    try {
      loadRuntime(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
    } catch (error) {
      ctx.ui.notify(`LSP config ignored: ${describeError(error)}`, "warning");
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}

/**
 * Builds the /lsp status message: one command line and one readiness line
 * per configured server.
 */
function buildStatusMessage(servers: ResolvedServer[], cwd: string): string {
  return servers
    .flatMap((server) => {
      const command = server.command;
      return [
        `${server.name} LSP command: ${command.command} ${command.args.join(" ")}`.trim(),
        `${server.name} status: ${
          isCommandAvailable(command.command, cwd, effectivePath(server.env)) ? "ready" : "command missing"
        }`,
      ];
    })
    .join("\n");
}

/**
 * Returns the notify level for the /lsp message: info when every configured
 * command is available, warning otherwise.
 */
function statusLevel(servers: ResolvedServer[], cwd: string): "info" | "warning" {
  return servers.every((server) => {
    const command = server.command;
    return isCommandAvailable(command.command, cwd, effectivePath(server.env));
  })
    ? "info"
    : "warning";
}

/**
 * Converts an unknown thrown value into a readable message.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
