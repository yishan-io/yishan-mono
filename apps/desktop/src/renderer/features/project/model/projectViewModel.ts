/**
 * Project view model + API mapper.
 *
 * Phase 3: the UI-consumed project shape, mapped from the API transport record.
 * Transport DTOs (api/types) do not enter feature stores; the mapper lives in
 * the model layer and the store holds view models.
 */
import type { ProjectRecord } from "../../../api/types";

export type ProjectViewModel = {
  id: string;
  name: string;
  key?: string;
  path?: string;
  missing?: boolean;
  gitUrl?: string;
  sourceType?: "git" | "git-local" | "unknown";
  repoProvider?: string | null;
  repoUrl?: string | null;
  repoKey?: string | null;
  localPath?: string | null;
  worktreePath?: string | null;
  contextEnabled?: boolean;
  defaultBranch?: string | null;
  icon?: string | null;
  color?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  commands?: Array<{ name: string; command: string }>;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
};

/**
 * Maps a backend project record into the UI project view model. Only present
 * transport fields are copied; the store never sees the raw DTO.
 */
export function mapProjectToViewModel(record: ProjectRecord): ProjectViewModel {
  return {
    id: record.id,
    name: record.name,
    key: record.repoKey ?? record.id,
    sourceType: record.sourceType,
    repoProvider: record.repoProvider,
    repoUrl: record.repoUrl,
    repoKey: record.repoKey,
    contextEnabled: record.contextEnabled,
    icon: record.icon,
    color: record.color,
    setupScript: record.setupScript,
    postScript: record.postScript,
    commands: record.commands,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdByUserId: record.createdByUserId,
  };
}
