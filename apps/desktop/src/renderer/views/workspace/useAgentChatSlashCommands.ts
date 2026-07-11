import { useEffect, useMemo, useState } from "react";
import { listSkills } from "../../commands/skillCommands";
import type { RichComposerSlashCommand } from "../../components/RichComposer";
import type { SkillInfo } from "../../rpc/daemonTypes";
import { buildSubagentSlashCommands } from "./agentChatSlashCommandCatalog";

/** Loads slash command suggestions for agent chat skills and sub-agents. */
export function useAgentChatSlashCommands(): RichComposerSlashCommand[] {
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  useEffect(() => {
    let isDisposed = false;

    listSkills()
      .then((nextSkills) => {
        if (!isDisposed) {
          setSkills(nextSkills);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setSkills([]);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  return useMemo(() => {
    const skillCommands: RichComposerSlashCommand[] = [...skills]
      .sort((leftSkill, rightSkill) => leftSkill.name.localeCompare(rightSkill.name))
      .map((skill) => ({
        id: `skill:${skill.name}`,
        category: "skill",
        title: `/${skill.name}`,
        description: skill.description,
        searchText: skill.name,
      }));

    return [...skillCommands, ...buildSubagentSlashCommands()];
  }, [skills]);
}
