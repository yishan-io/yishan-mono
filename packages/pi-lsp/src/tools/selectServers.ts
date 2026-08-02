/**
 * Server selection for tool calls: routes a diagnostics or fix request to
 * the configured servers whose extensions match, honoring server filters
 * and default-command availability.
 */
import path from "node:path";

import { effectivePath, isCommandAvailable } from "../helpers/commands";
import { discoverSupportedFiles, resolveRoot } from "../helpers/files";
import type { ResolvedServer } from "../types";

/**
 * Shown when no server matches a request.
 */
export const SUPPORTED_SERVERS_MESSAGE =
  "Supported LSP servers are defined by the pi-lsp config and selected by file extension.";

/**
 * One selected diagnostics route.
 */
export interface DiagnosticRoute {
  server: ResolvedServer;
  reason: string;
  files: string[];
}

/**
 * Selects diagnostics routes: default servers with missing commands are
 * skipped and reported; explicitly selected servers always run. Routes with
 * no matching files are dropped.
 */
export function selectDiagnosticRoutes(
  servers: ResolvedServer[],
  params: { root?: string; paths?: string[]; limit?: number; server?: string | string[] },
  defaultLimit: number,
): { root: string; routes: DiagnosticRoute[]; skipped: DiagnosticRoute[] } {
  const root = resolveRoot(params.root);
  const candidates = filterServers(servers, params.server);
  const skipped: DiagnosticRoute[] = [];
  const runnable = params.server
    ? candidates
    : candidates.filter((server) => {
        if (!server.isDefault) return true;
        if (isCommandAvailable(server.command.command, root, effectivePath(server.env))) return true;
        skipped.push({ server, reason: `${server.name} command missing`, files: [] });
        return false;
      });

  const filesByPolicy = new Map<string, string[]>();
  const routes = runnable
    .map((server) => {
      const key = JSON.stringify([
        server.extensions,
        [...server.skipDirectories].sort((left, right) => left.localeCompare(right)),
      ]);
      let files = filesByPolicy.get(key);
      if (!files) {
        files = discoverSupportedFiles(server, root, params.paths, params.limit ?? defaultLimit);
        filesByPolicy.set(key, files);
      }
      return { server, reason: `${server.name} diagnostics`, files };
    })
    .filter((route) => route.files.length > 0);

  if (routes.length === 0 && skipped.length === 0) {
    const scope = params.paths?.length ? ` in requested paths: ${params.paths.join(", ")}` : "";
    throw new Error(`No supported files found${scope}. ${SUPPORTED_SERVERS_MESSAGE}`);
  }

  return { root, routes, skipped };
}

/**
 * Selects the single server that supports a file for a fix, rejecting
 * ambiguity when multiple configured servers match and none was named.
 */
export function selectFixServer(
  servers: ResolvedServer[],
  params: { root?: string; path: string; server?: string },
): { root: string; server: ResolvedServer } {
  const root = resolveRoot(params.root);
  const file = path.resolve(root, params.path);
  const candidates = filterServers(servers, params.server).filter((server) => server.isSupportedFile(file));
  if (candidates.length === 0) {
    const override = params.server ? ` for server '${params.server}'` : "";
    throw new Error(`No fix route supports ${params.path}${override}. ${SUPPORTED_SERVERS_MESSAGE}`);
  }
  if (!params.server && candidates.length > 1) {
    throw new Error(
      `Multiple LSP servers support ${params.path}: ${candidates.map((server) => server.name).join(", ")}. Specify the server parameter for lsp_fix.`,
    );
  }
  const server = candidates[0];
  if (!server) {
    const override = params.server ? ` for server '${params.server}'` : "";
    throw new Error(`No fix route supports ${params.path}${override}. ${SUPPORTED_SERVERS_MESSAGE}`);
  }
  return { root, server };
}

/**
 * Filters servers by requested names, rejecting unknown names.
 */
export function filterServers(servers: ResolvedServer[], selected: string | string[] | undefined): ResolvedServer[] {
  if (!selected) return servers;
  const names = [...new Set((Array.isArray(selected) ? selected : [selected]).map((name) => name.trim()))].filter(
    (name) => name.length > 0,
  );
  if (names.length === 0) throw new Error("LSP server parameter must not be blank.");
  const matched = servers.filter((server) => names.includes(server.name));
  const missing = names.filter((name) => !servers.some((server) => server.name === name));
  if (missing.length) {
    const configured = servers.map((server) => server.name).join(", ") || "none";
    throw new Error(
      `Unknown LSP server(s): ${missing.join(", ")}. Configured LSP servers: ${configured}. Omit the server parameter to select matching servers automatically.`,
    );
  }
  return matched;
}
