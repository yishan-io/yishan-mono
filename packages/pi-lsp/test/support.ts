/**
 * Shared test helpers for the pi-lsp package.
 */
import type { ResolvedServer } from "../src/types";

/**
 * Builds a minimal ResolvedServer for tests: matches files by extension and
 * returns the server name as the language id.
 */
export function buildServer(name: string, extensions: string[]): ResolvedServer {
  return {
    name,
    isDefault: false,
    command: { command: name, args: [] },
    missingCommandHint: `install ${name}`,
    extensions,
    skipDirectories: new Set(["node_modules"]),
    languageIdFor() {
      return name;
    },
    isSupportedFile(filePath: string) {
      return extensions.some((extension) => filePath.endsWith(extension));
    },
  };
}

/**
 * A minimal recording mock of the Pi ExtensionAPI: captures registered
 * tools, commands, and event handlers.
 */
export function mockPi() {
  const commands = new Map<string, { description?: string; handler: (...args: unknown[]) => unknown }>();
  const events = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const tools: Array<{ name?: string; [key: string]: unknown }> = [];

  const pi = {
    registerCommand(name: string, command: { description?: string; handler: (...args: unknown[]) => unknown }) {
      commands.set(name, command);
    },
    registerTool(tool: { name?: string; [key: string]: unknown }) {
      tools.push(tool);
    },
    on(name: string, handler: (...args: unknown[]) => unknown) {
      events.set(name, [...(events.get(name) ?? []), handler]);
    },
  };

  return { pi: pi as never, commands, events, tools };
}

/**
 * A minimal mock ExtensionContext collecting notifications and statuses and
 * honoring an isProjectTrusted override.
 */
export function mockContext(overrides: Record<string, unknown> = {}) {
  const notifications: Array<{ message: string; level?: string }> = [];
  const statuses = new Map<string, string | undefined>();

  const ctx = {
    cwd: overrides.cwd ?? process.cwd(),
    mode: overrides.mode ?? (overrides.hasUI ? "tui" : undefined),
    hasUI: overrides.hasUI ?? (overrides.mode === "tui" || overrides.mode === "rpc"),
    ui: {
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      setStatus(key: string, value: string | undefined) {
        statuses.set(key, value);
      },
    },
    isProjectTrusted: overrides.isProjectTrusted ?? (() => false),
  };

  return {
    ctx: ctx as never,
    notifications,
    statuses,
  };
}

/**
 * Restores an environment variable after a test, unsetting it when it did
 * not exist before. Assigning undefined does not remove a Node env var, so
 * the delete operator is intentional here.
 */
export function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
