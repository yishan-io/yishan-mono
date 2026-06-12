import type { SkillInfo } from "../rpc/daemonTypes";
import { getDaemonClient } from "../rpc/rpcTransport";

/** Lists all built-in yishan skills with their current install state. */
export async function listSkills(): Promise<SkillInfo[]> {
  const client = await getDaemonClient();
  const payload = await client.skill.list(undefined);
  const raw = payload as { skills?: unknown[] };
  if (!Array.isArray(raw.skills)) {
    return [];
  }
  return raw.skills.map((s) => {
    const entry = s as Record<string, unknown>;
    return {
      name: typeof entry.name === "string" ? entry.name : "",
      description: typeof entry.description === "string" ? entry.description : "",
      installed: Boolean(entry.installed),
    };
  });
}

/** Installs one built-in yishan skill by name. */
export async function installSkill(name: string): Promise<void> {
  const client = await getDaemonClient();
  await client.skill.install({ name });
}

/** Uninstalls one built-in yishan skill by name. */
export async function uninstallSkill(name: string): Promise<void> {
  const client = await getDaemonClient();
  await client.skill.uninstall({ name });
}
