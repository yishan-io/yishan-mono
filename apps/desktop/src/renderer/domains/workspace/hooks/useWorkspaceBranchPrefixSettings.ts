import { useShallow } from "zustand/react/shallow";
import { workspaceSettingsStore } from "../state/workspaceSettingsStore";

/**
 * Subscribes to the git branch prefix settings (desktop7 Phase 23).
 *
 * Moved from Settings: branch-naming preferences belong to the Workspace
 * domain (used by create-workspace branch naming).
 */
export function useWorkspaceBranchPrefixSettings() {
  return workspaceSettingsStore(
    useShallow((state) => ({
      prefixMode: state.prefixMode,
      customPrefix: state.customPrefix,
    })),
  );
}
