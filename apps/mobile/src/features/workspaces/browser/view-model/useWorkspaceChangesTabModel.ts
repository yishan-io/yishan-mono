import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { getBaseName, getParentPath } from "@/features/workspaces/file-browser";
import { useWorkspaceChangesQuery } from "@/features/workspaces/queries/useWorkspaceChangesQuery";
import type {
  WorkspaceGitChange,
  WorkspaceGitChangeKind,
  WorkspaceGitChanges,
} from "@/features/workspaces/workspaces.types";
import { useWorkspaceChangesScrollState } from "../state/useWorkspaceChangesScrollState";

type UseWorkspaceChangesTabModelOptions = {
  browserStateId: string;
  focusedPath?: string;
  nodeId: string | null;
  onOpenDiff: (path: string, changeKind: WorkspaceGitChangeKind) => void;
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export type ChangeSection = {
  data: WorkspaceGitChange[];
  id: keyof WorkspaceGitChanges;
  title: string;
};

export type WorkspaceChangesTabModel = {
  empty: boolean;
  error: boolean;
  focusedPath?: string;
  getChangeBaseName: typeof getBaseName;
  getChangeParentPath: typeof getParentPath;
  getChangeSectionIndicator: typeof getChangeIndicator;
  loading: boolean;
  onOpenDiff: (path: string, changeKind: WorkspaceGitChangeKind) => void;
  onScrollEnd: () => void;
  onScrollOffsetChange: (offsetY: number) => void;
  refetch: () => Promise<unknown>;
  scrollListRef: ReturnType<typeof useWorkspaceChangesScrollState>["listRef"];
  sections: ChangeSection[];
  setListContentSize: () => void;
};

export function useWorkspaceChangesTabModel({
  browserStateId,
  focusedPath,
  nodeId,
  onOpenDiff,
  organizationId,
  projectId,
  workspaceId,
}: UseWorkspaceChangesTabModelOptions): WorkspaceChangesTabModel {
  const { t } = useAppLanguage();
  const changesQuery = useWorkspaceChangesQuery(organizationId, projectId, workspaceId, {
    enabled: organizationId.length > 0 && projectId.length > 0 && workspaceId.length > 0,
    nodeId,
  });
  const sections = buildSections(changesQuery.data ?? createEmptyChanges(), t);
  const focusedLocation = focusedPath ? findChangeLocation(sections, focusedPath) : null;
  const { handleContentSizeChange, handleScroll, listRef, persistScrollOffset } = useWorkspaceChangesScrollState({
    browserStateId,
    focusedLocation,
  });
  const totalCount = sections.reduce((sum, section) => sum + section.data.length, 0);

  return {
    empty: totalCount === 0,
    error: changesQuery.isError,
    focusedPath,
    getChangeBaseName: getBaseName,
    getChangeParentPath: getParentPath,
    getChangeSectionIndicator: getChangeIndicator,
    loading: changesQuery.isLoading,
    onOpenDiff,
    onScrollEnd: persistScrollOffset,
    onScrollOffsetChange: handleScroll,
    refetch: changesQuery.refetch,
    scrollListRef: listRef,
    sections,
    setListContentSize: handleContentSizeChange,
  };
}

function buildSections(
  changes: WorkspaceGitChanges,
  t: (key: string, params?: Record<string, string | number>) => string,
): ChangeSection[] {
  const sections: ChangeSection[] = [
    { id: "unstaged", title: t("shell.changesSectionUnstaged"), data: changes.unstaged },
    { id: "staged", title: t("shell.changesSectionStaged"), data: changes.staged },
    { id: "untracked", title: t("shell.changesSectionUntracked"), data: changes.untracked },
  ];

  return sections.filter((section) => section.data.length > 0);
}

function findChangeLocation(sections: ChangeSection[], focusedPath: string) {
  for (const [sectionIndex, section] of sections.entries()) {
    const itemIndex = section.data.findIndex((item) => item.path === focusedPath);
    if (itemIndex >= 0) {
      return { itemIndex, sectionIndex };
    }
  }

  return null;
}

function createEmptyChanges(): WorkspaceGitChanges {
  return {
    staged: [],
    unstaged: [],
    untracked: [],
  };
}

function getChangeIndicator(kind: WorkspaceGitChangeKind, sectionId: ChangeSection["id"]) {
  if (sectionId === "untracked") {
    return {
      colorKey: "$blue10" as const,
      fillKey: "$blue3" as const,
      label: "?",
    };
  }

  if (kind === "renamed") {
    return {
      colorKey: "$blue10" as const,
      fillKey: "$blue3" as const,
      label: "R",
    };
  }

  if (kind === "added") {
    return {
      colorKey: "$green10" as const,
      fillKey: "$green3" as const,
      label: "A",
    };
  }

  if (kind === "deleted") {
    return {
      colorKey: "$red10" as const,
      fillKey: "$red3" as const,
      label: "D",
    };
  }

  return {
    colorKey: "$yellow10" as const,
    fillKey: "$yellow3" as const,
    label: "M",
  };
}
