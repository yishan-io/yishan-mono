import {
  createAgentDefinition as createAgentDefinitionProcedure,
  getAgentDefinitionDetail as getAgentDefinitionDetailProcedure,
  installPiExtension as installPiExtensionProcedure,
  listAgentDefinitions as listAgentDefinitionsProcedure,
  listPiExtensions as listPiExtensionsProcedure,
  removeAgentDefinition as removeAgentDefinitionProcedure,
  removePiExtension as removePiExtensionProcedure,
  restoreAgentDefinition as restoreAgentDefinitionProcedure,
  updateAgentDefinition as updateAgentDefinitionProcedure,
  updatePiExtension as updatePiExtensionProcedure,
} from "../infrastructure/daemonAgentProcedures";
import type { AgentDefinitionDetail, AgentDefinitionInfo, PiExtensionInfo } from "../infrastructure/daemonAgentTypes";

function parsePiExtension(entry: Record<string, unknown>): PiExtensionInfo {
  return {
    name: typeof entry.name === "string" ? entry.name : "",
    description: typeof entry.description === "string" ? entry.description : "",
    source: typeof entry.source === "string" ? entry.source : "",
    version: typeof entry.version === "string" ? entry.version : "",
    latestVersion: typeof entry.latestVersion === "string" ? entry.latestVersion : "",
    hasUpdate: Boolean(entry.hasUpdate),
    official: Boolean(entry.official),
    installed: Boolean(entry.installed),
  };
}

function parseAgentDefinition(entry: Record<string, unknown>): AgentDefinitionInfo {
  return {
    name: typeof entry.name === "string" ? entry.name : "",
    description: typeof entry.description === "string" ? entry.description : "",
    model: typeof entry.model === "string" ? entry.model : "",
    thinking: typeof entry.thinking === "string" ? entry.thinking : "",
    tools: Array.isArray(entry.tools) ? entry.tools.map(String) : [],
    official: Boolean(entry.official),
  };
}

/** Lists installed pi extensions with official-vs-user classification. */
export async function listExtensions(): Promise<PiExtensionInfo[]> {
  const payload = await listPiExtensionsProcedure();
  if (!Array.isArray(payload.extensions)) {
    return [];
  }
  return payload.extensions.map((entry) => parsePiExtension(entry as Record<string, unknown>));
}

/** Installs a pi package source spec (npm:, git:, https://, or a local path). */
export async function installExtension(source: string): Promise<void> {
  await installPiExtensionProcedure({ source });
}

/** Removes an extension by its full source spec (e.g. npm:pi-web-fetch). */
export async function removeExtension(source: string): Promise<void> {
  await removePiExtensionProcedure({ source });
}

/** Re-installs an extension from the same source spec (pinned specs are not bumped). */
export async function updateExtension(source: string): Promise<void> {
  await updatePiExtensionProcedure({ source });
}

/** Lists agent definitions with official-vs-user classification (metadata only). */
export async function listAgentDefinitions(): Promise<AgentDefinitionInfo[]> {
  const payload = await listAgentDefinitionsProcedure();
  if (!Array.isArray(payload.agents)) {
    return [];
  }
  return payload.agents.map((entry) => parseAgentDefinition(entry as Record<string, unknown>));
}

/** Fetches one agent definition including its full content. */
export async function getAgentDefinitionDetail(name: string): Promise<AgentDefinitionDetail> {
  const entry = (await getAgentDefinitionDetailProcedure({ name })) as unknown as Record<string, unknown>;
  return {
    ...parseAgentDefinition(entry),
    content: typeof entry.content === "string" ? entry.content : "",
  };
}

/** Creates a new user agent definition (frontmatter is built daemon-side). */
export async function createAgentDefinition(input: {
  name: string;
  description: string;
  content: string;
  model: string;
  thinking: string;
  tools: string[];
}): Promise<void> {
  await createAgentDefinitionProcedure(input);
}

/** Overwrites an agent definition (official or user) with full content. */
export async function updateAgentDefinition(input: { name: string; content: string }): Promise<void> {
  await updateAgentDefinitionProcedure(input);
}

/** Removes a user agent definition. */
export async function removeAgentDefinition(name: string): Promise<void> {
  await removeAgentDefinitionProcedure({ name });
}

/** Restores an official agent definition to its shipped content. */
export async function restoreAgentDefinition(name: string): Promise<void> {
  await restoreAgentDefinitionProcedure({ name });
}
