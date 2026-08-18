import type { AgentDefinitionDetail, AgentDefinitionInfo, PiExtensionInfo } from "../../../rpc/daemonTypes";
import { getDaemonClient } from "../../../rpc/rpcTransport";

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
  const client = await getDaemonClient();
  const payload = await client.customize.extensions.list(undefined);
  const raw = payload as { extensions?: unknown[] };
  if (!Array.isArray(raw.extensions)) {
    return [];
  }
  return raw.extensions.map((entry) => parsePiExtension(entry as Record<string, unknown>));
}

/** Installs a pi package source spec (npm:, git:, https://, or a local path). */
export async function installExtension(source: string): Promise<void> {
  const client = await getDaemonClient();
  await client.customize.extensions.install({ source });
}

/** Removes an extension by its full source spec (e.g. npm:pi-web-fetch). */
export async function removeExtension(source: string): Promise<void> {
  const client = await getDaemonClient();
  await client.customize.extensions.remove({ source });
}

/** Re-installs an extension from the same source spec (pinned specs are not bumped). */
export async function updateExtension(source: string): Promise<void> {
  const client = await getDaemonClient();
  await client.customize.extensions.update({ source });
}

/** Lists agent definitions with official-vs-user classification (metadata only). */
export async function listAgentDefinitions(): Promise<AgentDefinitionInfo[]> {
  const client = await getDaemonClient();
  const payload = await client.customize.agents.list(undefined);
  const raw = payload as { agents?: unknown[] };
  if (!Array.isArray(raw.agents)) {
    return [];
  }
  return raw.agents.map((entry) => parseAgentDefinition(entry as Record<string, unknown>));
}

/** Fetches one agent definition including its full content. */
export async function getAgentDefinitionDetail(name: string): Promise<AgentDefinitionDetail> {
  const client = await getDaemonClient();
  const payload = await client.customize.agents.detail({ name });
  const entry = payload as Record<string, unknown>;
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
  const client = await getDaemonClient();
  await client.customize.agents.create(input);
}

/** Overwrites an agent definition (official or user) with full content. */
export async function updateAgentDefinition(input: { name: string; content: string }): Promise<void> {
  const client = await getDaemonClient();
  await client.customize.agents.update(input);
}

/** Removes a user agent definition. */
export async function removeAgentDefinition(name: string): Promise<void> {
  const client = await getDaemonClient();
  await client.customize.agents.remove({ name });
}

/** Restores an official agent definition to its shipped content. */
export async function restoreAgentDefinition(name: string): Promise<void> {
  const client = await getDaemonClient();
  await client.customize.agents.restore({ name });
}
