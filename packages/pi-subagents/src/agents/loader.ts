import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

import type { AgentDefinition, AgentDefinitionDiagnostic, AgentRegistrySnapshot } from "./types";
import type { AgentFrontmatter } from "./validation";
import { validateAgentDefinition } from "./validation";

const MARKDOWN_EXTENSION = ".md";
const BUILTIN_AGENTS_DIR = fileURLToPath(new URL("../../agents", import.meta.url));

/** Options for loading agent definitions from all supported sources. */
export interface LoadAgentDefinitionsOptions {
  cwd: string;
  builtinAgentsDir?: string;
  userAgentsDir?: string;
  projectAgentsDir?: string | null;
  allowedToolNames?: readonly string[];
}

/**
 * Loads built-in, user, and project agent definitions with override precedence.
 */
export function loadAgentDefinitions(options: LoadAgentDefinitionsOptions): AgentRegistrySnapshot {
  const diagnostics: AgentDefinitionDiagnostic[] = [];
  const builtinAgents = loadAgentDefinitionsFromDir({
    dir: options.builtinAgentsDir ?? BUILTIN_AGENTS_DIR,
    source: "builtin",
    allowedToolNames: options.allowedToolNames,
  });
  diagnostics.push(...builtinAgents.diagnostics);

  const userAgents = loadAgentDefinitionsFromDir({
    dir: options.userAgentsDir ?? join(getAgentDir(), "agents"),
    source: "user",
    allowedToolNames: options.allowedToolNames,
  });
  diagnostics.push(...userAgents.diagnostics);

  const resolvedProjectAgentsDir =
    options.projectAgentsDir === undefined ? findNearestProjectAgentsDir(options.cwd) : options.projectAgentsDir;
  const projectAgents =
    resolvedProjectAgentsDir === null
      ? { agents: [], diagnostics: [] }
      : loadAgentDefinitionsFromDir({
          dir: resolvedProjectAgentsDir,
          source: "project",
          allowedToolNames: options.allowedToolNames,
        });
  diagnostics.push(...projectAgents.diagnostics);

  const agents = resolveAgentDefinitionOverrides(builtinAgents.agents, userAgents.agents, projectAgents.agents);
  return { agents, diagnostics };
}

/** Input for loading agent files from one directory. */
export interface LoadAgentDefinitionsFromDirOptions {
  dir: string;
  source: AgentDefinition["source"];
  allowedToolNames?: readonly string[];
}

/** Result of loading agent definitions from one directory. */
export interface LoadAgentDefinitionsFromDirResult {
  agents: AgentDefinition[];
  diagnostics: AgentDefinitionDiagnostic[];
}

/**
 * Loads all agent definitions from one directory.
 */
export function loadAgentDefinitionsFromDir(
  options: LoadAgentDefinitionsFromDirOptions,
): LoadAgentDefinitionsFromDirResult {
  if (!existsSync(options.dir)) {
    return { agents: [], diagnostics: [] };
  }

  const diagnostics: AgentDefinitionDiagnostic[] = [];
  const agents: AgentDefinition[] = [];
  const directoryEntries = readMarkdownEntries(options.dir);

  for (const fileName of directoryEntries) {
    const filePath = join(options.dir, fileName);
    const loadedAgent = loadAgentDefinitionFile({
      filePath,
      source: options.source,
      allowedToolNames: options.allowedToolNames,
    });

    diagnostics.push(...loadedAgent.diagnostics);
    if (loadedAgent.agent) {
      agents.push(loadedAgent.agent);
    }
  }

  return { agents, diagnostics };
}

/** Input for loading one agent definition file. */
export interface LoadAgentDefinitionFileOptions {
  filePath: string;
  source: AgentDefinition["source"];
  allowedToolNames?: readonly string[];
}

/** Result of loading one agent definition file. */
export interface LoadAgentDefinitionFileResult {
  agent?: AgentDefinition;
  diagnostics: AgentDefinitionDiagnostic[];
}

/**
 * Loads and validates one agent definition markdown file.
 */
export function loadAgentDefinitionFile(options: LoadAgentDefinitionFileOptions): LoadAgentDefinitionFileResult {
  try {
    const rawContent = readFileSync(options.filePath, "utf8");
    const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(rawContent);

    return validateAgentDefinition({
      frontmatter,
      body,
      path: options.filePath,
      source: options.source,
      allowedToolNames: options.allowedToolNames,
    });
  } catch {
    return {
      diagnostics: [{ message: "Failed to parse agent definition file", path: options.filePath }],
    };
  }
}

/**
 * Resolves agent override precedence in the order builtin < user < project.
 */
export function resolveAgentDefinitionOverrides(
  builtinAgents: AgentDefinition[],
  userAgents: AgentDefinition[],
  projectAgents: AgentDefinition[],
): AgentDefinition[] {
  const agentDefinitionsByName = new Map<string, AgentDefinition>();

  for (const agentDefinition of builtinAgents) {
    agentDefinitionsByName.set(normalizeAgentName(agentDefinition.name), agentDefinition);
  }

  for (const agentDefinition of userAgents) {
    agentDefinitionsByName.set(normalizeAgentName(agentDefinition.name), agentDefinition);
  }

  for (const agentDefinition of projectAgents) {
    agentDefinitionsByName.set(normalizeAgentName(agentDefinition.name), agentDefinition);
  }

  return Array.from(agentDefinitionsByName.values()).sort((leftAgent, rightAgent) =>
    leftAgent.name.localeCompare(rightAgent.name),
  );
}

/**
 * Finds the nearest `.pi/agents` directory by walking parent directories.
 */
export function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = resolve(cwd);

  while (true) {
    const candidateDir = join(currentDir, CONFIG_DIR_NAME, "agents");
    if (existsSync(candidateDir)) {
      return candidateDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

/**
 * Normalizes an agent name for case-insensitive matching.
 */
export function normalizeAgentName(name: string): string {
  return name.trim().toLowerCase();
}

function readMarkdownEntries(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(MARKDOWN_EXTENSION))
      .map((entry) => entry.name)
      .sort((leftName, rightName) => leftName.localeCompare(rightName));
  } catch {
    return [];
  }
}
