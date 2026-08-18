import { useEffect, useState } from "react";
import { getCachedAgentChatSlashCommands, loadAgentChatSlashCommands } from "./agentChatSlashCommandCache";
import type { RichComposerSlashCommand } from "./composer/RichComposer";

/** Loads slash command suggestions for agent chat skills and sub-agents. */
export function useAgentChatSlashCommands(): RichComposerSlashCommand[] {
  const [slashCommands, setSlashCommands] = useState<RichComposerSlashCommand[]>(
    () => getCachedAgentChatSlashCommands() ?? [],
  );

  useEffect(() => {
    let isDisposed = false;

    if (slashCommands.length > 0) {
      return () => {
        isDisposed = true;
      };
    }

    loadAgentChatSlashCommands().then((nextSlashCommands) => {
      if (!isDisposed) {
        setSlashCommands(nextSlashCommands);
      }
    });

    return () => {
      isDisposed = true;
    };
  }, [slashCommands.length]);

  return slashCommands;
}
