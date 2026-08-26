import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

import type {
  AgentDefinition,
  AgentDefinitionDiagnostic,
  AgentRegistrySnapshot,
  InvalidAgentDefinition,
} from "./types";
import type { AgentFrontmatter } from "./validation";
import { validateAgentDefinition } from "./validation";

/**
 * Normalizes an agent name for case-insensitive matching.
 */
export function normalizeAgentName(name: string): string {
  return name.trim().toLowerCase();
}

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
  const builtinAgents = loadAgentDefinitionEntriesFromDir({
    dir: options.builtinAgentsDir ?? BUILTIN_AGENTS_DIR,
    source: "builtin",
    allowedToolNames: options.allowedToolNames,
  });
  diagnostics.push(...builtinAgents.diagnostics);

  const userAgents = loadAgentDefinitionEntriesFromDir({
    dir: options.userAgentsDir ?? join(getAgentDir(), "agents"),
    source: "user",
    allowedToolNames: options.allowedToolNames,
  });
  diagnostics.push(...userAgents.diagnostics);

  const resolvedProjectAgentsDir =
    options.projectAgentsDir === undefined ? findNearestProjectAgentsDir(options.cwd) : options.projectAgentsDir;
  const projectAgents =
    resolvedProjectAgentsDir === null
      ? emptyLoadedAgentDefinitionResult()
      : loadAgentDefinitionEntriesFromDir({
          dir: resolvedProjectAgentsDir,
          source: "project",
          allowedToolNames: options.allowedToolNames,
        });
  diagnostics.push(...projectAgents.diagnostics);

  const resolvedDefinitions = resolveAgentDefinitionEntries(builtinAgents, userAgents, projectAgents);
  return {
    agents: resolvedDefinitions.agents,
    diagnostics,
    invalidAgentsByName: new Map(
      resolvedDefinitions.invalidAgents.map((invalidAgent) => [normalizeAgentName(invalidAgent.name), invalidAgent]),
    ),
  };
}

function emptyLoadedAgentDefinitionResult(): LoadedAgentDefinitionsFromDirResult {
  return { agents: [], invalidAgents: [], diagnostics: [], entries: [] };
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
  /** Invalid named definitions, when the loader supports invalid-definition reporting. */
  invalidAgents?: InvalidAgentDefinition[];
  diagnostics: AgentDefinitionDiagnostic[];
}

type AgentDefinitionEntry = AgentDefinition | InvalidAgentDefinition;

interface LoadedAgentDefinitionsFromDirResult {
  agents: AgentDefinition[];
  invalidAgents: InvalidAgentDefinition[];
  diagnostics: AgentDefinitionDiagnostic[];
  entries: AgentDefinitionEntry[];
}

/**
 * Loads all agent definitions from one directory.
 */
export function loadAgentDefinitionsFromDir(
  options: LoadAgentDefinitionsFromDirOptions,
): LoadAgentDefinitionsFromDirResult {
  const definitions = loadAgentDefinitionEntriesFromDir(options);
  return {
    agents: definitions.agents,
    invalidAgents: definitions.invalidAgents,
    diagnostics: definitions.diagnostics,
  };
}

function loadAgentDefinitionEntriesFromDir(
  options: LoadAgentDefinitionsFromDirOptions,
): LoadedAgentDefinitionsFromDirResult {
  if (!existsSync(options.dir)) {
    return emptyLoadedAgentDefinitionResult();
  }

  const diagnostics: AgentDefinitionDiagnostic[] = [];
  const agents: AgentDefinition[] = [];
  const invalidAgents: InvalidAgentDefinition[] = [];
  const entries: AgentDefinitionEntry[] = [];

  for (const fileName of readMarkdownEntries(options.dir)) {
    const filePath = join(options.dir, fileName);
    const loadedAgent = loadAgentDefinitionFile({
      filePath,
      source: options.source,
      allowedToolNames: options.allowedToolNames,
    });

    diagnostics.push(...loadedAgent.diagnostics);
    if (loadedAgent.agent) {
      agents.push(loadedAgent.agent);
      entries.push(loadedAgent.agent);
    }
    if (loadedAgent.invalidAgent) {
      invalidAgents.push(loadedAgent.invalidAgent);
      entries.push(loadedAgent.invalidAgent);
    }
  }

  return { agents, invalidAgents, diagnostics, entries };
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
  invalidAgent?: InvalidAgentDefinition;
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

  for (const agentDefinition of [...builtinAgents, ...userAgents, ...projectAgents]) {
    agentDefinitionsByName.set(normalizeAgentName(agentDefinition.name), agentDefinition);
  }

  return Array.from(agentDefinitionsByName.values()).sort((leftAgent, rightAgent) =>
    leftAgent.name.localeCompare(rightAgent.name),
  );
}

function resolveAgentDefinitionEntries(
  builtinDefinitions: LoadedAgentDefinitionsFromDirResult,
  userDefinitions: LoadedAgentDefinitionsFromDirResult,
  projectDefinitions: LoadedAgentDefinitionsFromDirResult,
): LoadedAgentDefinitionsFromDirResult {
  const definitionsByName = new Map<string, AgentDefinitionEntry>();

  for (const definitions of [builtinDefinitions, userDefinitions, projectDefinitions]) {
    for (const definition of definitions.entries) {
      definitionsByName.set(normalizeAgentName(definition.name), definition);
    }
  }

  const entries = Array.from(definitionsByName.values());
  return {
    agents: entries
      .filter((definition): definition is AgentDefinition => "description" in definition)
      .sort((leftAgent, rightAgent) => leftAgent.name.localeCompare(rightAgent.name)),
    invalidAgents: entries.filter((definition): definition is InvalidAgentDefinition => "diagnostics" in definition),
    diagnostics: [],
    entries,
  };
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
