import type { SkillDetail, SkillInfo } from "../rpc/daemonTypes";
import { getDaemonClient } from "../rpc/rpcTransport";

function parseSkillInfo(entry: Record<string, unknown>): SkillInfo {
  return {
    name: typeof entry.name === "string" ? entry.name : "",
    description: typeof entry.description === "string" ? entry.description : "",
    version: typeof entry.version === "string" ? entry.version : "",
    source: typeof entry.source === "string" ? entry.source : "",
    sourceKind: typeof entry.sourceKind === "string" ? entry.sourceKind : "",
    installed: Boolean(entry.installed),
    installedForAgents: Array.isArray(entry.installedForAgents)
      ? entry.installedForAgents.filter((value): value is string => typeof value === "string")
      : [],
    official: Boolean(entry.official),
    canUpdate: Boolean(entry.canUpdate),
    hasUpdate: Boolean(entry.hasUpdate),
  };
}

/** Lists all catalog and installed skills with their current status. */
export async function listSkills(): Promise<SkillInfo[]> {
  const client = await getDaemonClient();
  const payload = await client.skill.list(undefined);
  const raw = payload as { skills?: unknown[] };
  if (!Array.isArray(raw.skills)) {
    return [];
  }
  return raw.skills.map((s) => {
    return parseSkillInfo(s as Record<string, unknown>);
  });
}

/** Installs a skill from an official name or URL source. */
export async function addSkill(source: string): Promise<void> {
  const client = await getDaemonClient();
  await client.skill.add({ source });
}

/** Removes one installed skill by name. */
export async function removeSkill(name: string): Promise<void> {
  const client = await getDaemonClient();
  await client.skill.remove({ name });
}

/** Fetches detailed skill info including file contents. */
export async function getSkillDetail(name: string): Promise<SkillDetail> {
  const client = await getDaemonClient();
  const payload = await client.skill.detail({ name });
  const entry = payload as Record<string, unknown>;
  return {
    ...parseSkillInfo(entry),
    files:
      typeof entry.files === "object" && entry.files !== null
        ? Object.fromEntries(Object.entries(entry.files as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
        : {},
  };
}

/** Reinstalls an installed skill from its recorded source. */
export async function updateSkill(name: string): Promise<void> {
  const client = await getDaemonClient();
  await client.skill.update({ name });
}
