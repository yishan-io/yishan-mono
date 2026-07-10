import * as Clipboard from "expo-clipboard";
import { useCallback, useState } from "react";

import type { WorkspaceFileEntry } from "@/features/workspaces/workspaces.types";

export function useWorkspaceEntryMenu() {
  const [menuEntry, setMenuEntry] = useState<WorkspaceFileEntry | null>(null);

  const copyMenuEntryPath = useCallback(() => {
    if (!menuEntry) {
      return;
    }

    void Clipboard.setStringAsync(menuEntry.path);
  }, [menuEntry]);

  return {
    closeMenu: () => setMenuEntry(null),
    copyMenuEntryPath,
    menuEntry,
    openMenu: setMenuEntry,
  };
}
