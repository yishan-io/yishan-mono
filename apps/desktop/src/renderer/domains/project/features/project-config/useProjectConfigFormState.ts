import { generateId } from "@shared/ids/generateId";
import { useEffect, useEffectEvent, useState } from "react";
import { DEFAULT_PROJECT_ICON_ID, findProjectIconOption } from "../../ui/projectIcons";

export type ProjectConfigCommandDraft = {
  id: string;
  name: string;
  command: string;
};

export type ProjectConfigDraft = {
  name: string;
  localPath: string;
  worktreePath: string;
  contextEnabled: boolean;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  commands: ProjectConfigCommandDraft[];
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
  taskPrefix?: string | null;
  icon?: string | null;
  color?: string | null;
  setupScript?: string | null;
  postScript?: string | null;
  commands?: Array<{ name?: string | null; command?: string | null } | string> | null;
};

export const DEFAULT_ICON_BG_COLOR = "#1E66F5";

export function createProjectConfigCommandDraft(name: string, command: string): ProjectConfigCommandDraft {
  return {
    id: generateId(),
    name,
    command,
  };
}

function getDefaultDraft(): ProjectConfigDraft {
  return {
    name: "",
    localPath: "",
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

  const initializeDraft = useEffectEvent(() => {
    if (!repo) {
      return;
    }

    let cancelled = false;
    const worktreePath = repo.worktreePath ?? "";
    setDraft({
      name: repo.name,
      localPath: repo.localPath ?? repo.path ?? "",
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
                return createProjectConfigCommandDraft(command, command);
              }
              const command = item.command?.trim() || "";
              const name = item.name?.trim() || command;
              if (!command || !name) {
                return null;
              }
              return createProjectConfigCommandDraft(name, command);
            })
            .filter((item): item is ProjectConfigCommandDraft => item !== null)
        : [],
    });
    if (!worktreePath) {
      // fire-and-forget: fill only the untouched default field for this open session.
      void getDefaultWorktreeLocation().then(
        (defaultPath) => {
          if (!cancelled) {
            setDraft((previous) => (previous.worktreePath ? previous : { ...previous, worktreePath: defaultPath }));
          }
        },
        () => {
          /* No default is available; keep the editable path empty. */
        },
      );
    }
    return () => {
      cancelled = true;
    };
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: The Effect Event reads fresh project data without resetting drafts on store refresh.
  useEffect(() => {
    if (open && repo?.id) {
      return initializeDraft();
    }
  }, [open, repo?.id]);

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
