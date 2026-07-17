import { LuMinus, LuPlus } from "react-icons/lu";
import type { ProjectGitChangeItem } from "./ProjectGitChangesList.types";

type FolderGroup = {
  folder: string;
  files: ProjectGitChangeItem[];
};

/** Groups changed files by parent folder so list rows stay compact. */
export function groupByFolder(files: ProjectGitChangeItem[]): FolderGroup[] {
  const groups = new Map<string, ProjectGitChangeItem[]>();

  for (const file of files) {
    const pathParts = file.path.split("/");
    const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : ".";
    const current = groups.get(folder) ?? [];
    current.push(file);
    groups.set(folder, current);
  }

  return [...groups.entries()].map(([folder, folderFiles]) => ({
    folder,
    files: folderFiles,
  }));
}

/** Returns whether one drag/drop move between sections maps to a valid git action. */
export function canMoveFileBetweenSections(sourceSectionId: string, targetSectionId: string) {
  if (sourceSectionId === targetSectionId) {
    return false;
  }

  if (targetSectionId === "staged") {
    return sourceSectionId !== "staged";
  }

  return sourceSectionId === "staged";
}

/** Builds one stable selection key from section and path values. */
export function getFileSelectionKey(sectionId: string, path: string) {
  return `${sectionId}::${path}`;
}

/** Builds one stable collapse key for a folder group inside a section. */
export function getFolderCollapseKey(sectionId: string, folder: string) {
  return `${sectionId}::${folder}`;
}

/** Resolves label and icon used for track/unstage actions per section. */
export function getTrackActionMeta(sectionId: string) {
  if (sectionId === "staged") {
    return {
      verb: "Unstage",
      FileIcon: LuMinus,
    };
  }

  return {
    verb: "Stage",
    FileIcon: LuPlus,
  };
}

/** Returns whether one section should render revert actions. */
export function shouldShowRevertAction(sectionId: string) {
  return sectionId !== "staged";
}

/** Resolves section-specific wording for destructive restore actions. */
export function getRestoreActionVerb(sectionId: string) {
  return sectionId === "untracked" ? "Discard" : "Revert";
}

export type { FolderGroup };
