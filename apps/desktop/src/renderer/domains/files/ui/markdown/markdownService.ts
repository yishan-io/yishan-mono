import { parseMarkdownToHtml } from "./markdownParser";

/**
 * Service that parses markdown on the main thread.
 *
 * Usage:
 *   const html = await markdownService.parse(content);
 */

class MarkdownService {
  parse(content: string): Promise<string> {
    return parseMarkdownToHtml(content);
  }

  dispose(): void {
    return;
  }
}

/**
 * Shared singleton. Survives HMR via globalThis storage.
 */
const GLOBAL_KEY = "__markdownService__" as const;

function getOrCreateService(): MarkdownService {
  const global = globalThis as unknown as Record<string, MarkdownService | undefined>;
  if (global[GLOBAL_KEY]) {
    return global[GLOBAL_KEY];
  }
  const instance = new MarkdownService();
  global[GLOBAL_KEY] = instance;
  return instance;
}

export const markdownService = getOrCreateService();
