/**
 * Workspace snapshot view-model types (D17).
 *
 * `DaemonLocalFolder` is daemon-local vocabulary. The Project/Workspace/
 * pull-request record shapes previously mirrored here were moved to their
 * owning Domain API boundaries (Desktop 11 Phase 47); the Workspace Model
 * and State layers type-import them from `workspace/api/types` (or the
 * owning Domain index) instead of duplicating the transport shapes.
 */

export type DaemonLocalFolder = {
  id: string;
  path: string;
  name?: string;
  state?: string;
  health?: string;
};
