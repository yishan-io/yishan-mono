import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONTEXT_MARKER = "## Personal Project Context (.my-context/)";
const PERSONA_MARKER = "## Developer Persona (.yishan/memory/PERSONA.md)";

interface StaticProjectContext {
  readonly listing: string;
  readonly memoryPath: string;
}

export interface InjectedMemoryContextBuilder {
  build(input: { projectRoot: string }): string | null;
}

export interface CreateInjectedMemoryContextBuilderOptions {
  personaPath?: string;
}

/**
 * Creates a builder for injected Pi memory context.
 */
export function createInjectedMemoryContextBuilder(
  options: CreateInjectedMemoryContextBuilderOptions = {},
): InjectedMemoryContextBuilder {
  const personaPath = options.personaPath ?? join(homedir(), ".yishan", "memory", "PERSONA.md");
  const staticProjectContextByRoot = new Map<string, StaticProjectContext | null>();

  return {
    build(input) {
      const staticProjectContext = getStaticProjectContext(input.projectRoot, staticProjectContextByRoot);
      if (!staticProjectContext) {
        return null;
      }

      const memory = readTrimmedFile(staticProjectContext.memoryPath);
      let contextBlock = memory
        ? `${staticProjectContext.listing}\n\n### Current session memory (.my-context/MEMORY.md)\n\n${memory}`
        : `${staticProjectContext.listing}\n\n\`.my-context/MEMORY.md\` does not exist yet.`;

      if (process.env.YISHAN_REMOTE_HOST_POLICY === "1") {
        return `## Remote Host Policy (1)\n\nThis session is running under remote-host / service-token policy. Do not read or use \`~/.yishan/memory/PERSONA.md\` in this session. Persona is user-level context and is disabled here.\n\n---\n\n${contextBlock}`;
      }

      const persona = readTrimmedFile(personaPath);
      if (persona) {
        contextBlock = `${PERSONA_MARKER}\n\n${persona}\n\n---\n\n${contextBlock}`;
      }

      return contextBlock;
    },
  };
}

function getStaticProjectContext(
  projectRoot: string,
  cache: Map<string, StaticProjectContext | null>,
): StaticProjectContext | null {
  const cached = cache.get(projectRoot);
  if (cached !== undefined) {
    return cached;
  }

  const myContextPath = join(projectRoot, ".my-context");
  if (!existsSync(myContextPath)) {
    cache.set(projectRoot, null);
    return null;
  }

  const files: string[] = [];
  const directories: string[] = [];
  for (const entry of readdirSync(myContextPath)) {
    if (entry.startsWith(".")) {
      continue;
    }

    const entryPath = join(myContextPath, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      directories.push(entry);
      continue;
    }
    if (entry.endsWith(".md") && entry !== "MEMORY.md") {
      files.push(entry);
    }
  }

  const lines = [
    CONTEXT_MARKER,
    "",
    "`.my-context/` is the owner's personal context directory — never committed, never shared.",
    "",
    "**Lookup priority:** `.my-context/MEMORY.md` → other `.my-context/` docs → codebase.",
  ];

  if (files.length > 0 || directories.length > 0) {
    lines.push("", "### Contents of .my-context/", "");
    for (const file of files) {
      lines.push(`- \`.my-context/${file}\``);
    }
    for (const directory of directories) {
      lines.push(`- \`.my-context/${directory}/\` (subdirectory — list it when relevant)`);
    }
  }

  const staticProjectContext = {
    listing: lines.join("\n"),
    memoryPath: join(myContextPath, "MEMORY.md"),
  } satisfies StaticProjectContext;
  cache.set(projectRoot, staticProjectContext);
  return staticProjectContext;
}

function readTrimmedFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}
