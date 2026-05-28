import { useEffect, useState } from "react";
import {
  DEFAULT_PROJECT_ICON_ID,
  findProjectIconOption,
} from "../../../components/projectIcons";

export type ProjectConfigDraft = {
  name: string;
  worktreePath: string;
  contextEnabled: boolean;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  commands: Array<{ name: string; command: string }>;
};

type ProjectLike = {
  id: string;
  name: string;
  localPath?: string | null;
  path?: string;
  gitUrl?: string;
  repoUrl?: string | null;
  key?: string;
  repoKey?: string | null;
  worktreePath?: string | null;
  contextEnabled?: boolean;
  icon?: string | null;
  color?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  commands?: Array<{ name?: string | null; command?: string | null } | string> | null;
};

export const DEFAULT_ICON_BG_COLOR = "#1E66F5";

function getDefaultDraft(): ProjectConfigDraft {
  return {
    name: "",
    worktreePath: "",
    contextEnabled: true,
    icon: DEFAULT_PROJECT_ICON_ID,
    color: DEFAULT_ICON_BG_COLOR,
    setupScript: "",
    postScript: "",
    commands: [],
  };
}

type UseProjectConfigFormStateInput = {
  open: boolean;
  repoId: string;
  projects: ProjectLike[];
  getDefaultWorktreeLocation: () => Promise<string>;
};

export function useProjectConfigFormState({
  open,
  repoId,
  projects,
  getDefaultWorktreeLocation,
}: UseProjectConfigFormStateInput) {
  const repo = projects.find((item) => item.id === repoId);
  const [draft, setDraft] = useState<ProjectConfigDraft>(getDefaultDraft);
  const [iconAnchorEl, setIconAnchorEl] = useState<HTMLElement | null>(null);

  const repoLocalPath = repo?.localPath ?? repo?.path ?? "";
  const repoGitUrl = repo?.gitUrl ?? repo?.repoUrl ?? "";
  const repoKey = repo?.key ?? repo?.repoKey ?? "";
  const trimmedRepoLocalPath = repoLocalPath.trim();

  useEffect(() => {
    if (!open || !repo) {
      return;
    }

    let cancelled = false;

    const loadDraft = async () => {
      let worktreePath = repo.worktreePath ?? "";
      if (!worktreePath) {
        try {
          worktreePath = await getDefaultWorktreeLocation();
        } catch {
          worktreePath = "";
        }
      }

      if (cancelled) {
        return;
      }

      setDraft({
        name: repo.name,
        worktreePath,
        contextEnabled: repo.contextEnabled ?? true,
        icon: findProjectIconOption(repo.icon ?? undefined)?.id ?? DEFAULT_PROJECT_ICON_ID,
        color: repo.color ?? DEFAULT_ICON_BG_COLOR,
        setupScript: repo.setupScript ?? "",
        postScript: repo.postScript ?? "",
        commands: Array.isArray(repo.commands)
          ? repo.commands
              .map((item) => {
                if (typeof item === "string") {
                  const command = item.trim();
                  if (!command) {
                    return null;
                  }
                  return { name: command, command };
                }
                const command = item.command?.trim() || "";
                const name = item.name?.trim() || command;
                if (!command || !name) {
                  return null;
                }
                return { name, command };
              })
              .filter((item): item is { name: string; command: string } => item !== null)
          : [],
      });
    };

    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [getDefaultWorktreeLocation, open, repo]);

  return {
    repo,
    draft,
    setDraft,
    iconAnchorEl,
    setIconAnchorEl,
    repoLocalPath,
    repoGitUrl,
    repoKey,
    trimmedRepoLocalPath,
  };
}
