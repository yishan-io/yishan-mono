import type { ExternalAppId } from "@renderer/domains/files";
import { selectProjectLastUsedExternalAppIdFromState } from "../state/projectSelectors";
import { projectStore } from "../state/projectStore";

/**
 * Subscribes to the last-used external app id from the Project Store.
 * Public Project feature UI binding for cross-feature consumers (Phase 12,
 * desktop5.md) — files UI reads project state through this hook instead of
 * importing the Project Store directly.
 */
export function useProjectLastUsedExternalAppId(): ExternalAppId | undefined {
  return projectStore(selectProjectLastUsedExternalAppIdFromState);
}
