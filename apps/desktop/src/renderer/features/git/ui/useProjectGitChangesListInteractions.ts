import { type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, useCallback, useState } from "react";
import { FILETREE_DRAG_MIME } from "@renderer/features/files";
import type { ProjectGitChangeItem, ProjectGitChangesSection } from "./ProjectGitChangesList.types";
import { canMoveFileBetweenSections, getFileSelectionKey } from "./projectGitChangesListHelpers";

type UseProjectGitChangesListInteractionsParams = {
  sections: ProjectGitChangesSection[];
  /** Absolute worktree root. When present, drag payloads also carry attachable absolute paths (for the chat composer). */
  worktreePath?: string;
  onSelectFile?: (file: ProjectGitChangeItem) => void;
  onMoveFile?: (
    file: ProjectGitChangeItem,
    sourceSectionId: ProjectGitChangesSection["id"],
    targetSectionId: ProjectGitChangesSection["id"],
  ) => void;
  onMoveFiles?: (
    files: ProjectGitChangeItem[],
    sourceSectionId: ProjectGitChangesSection["id"],
    targetSectionId: ProjectGitChangesSection["id"],
  ) => void;
};

/**
 * Encodes one absolute path as a file:// URI, percent-encoding each path segment.
 * The path always gets exactly one leading slash so a Windows drive letter stays
 * in the path position (file:///C:/...) instead of being parsed as URI authority.
 */
function toFileUri(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${encoded}`;
}

/** Manages file selection and drag/drop interactions for the git changes list. */
export function useProjectGitChangesListInteractions({
  sections,
  worktreePath,
  onSelectFile,
  onMoveFile,
  onMoveFiles,
}: UseProjectGitChangesListInteractionsParams) {
  const [draggedFileState, setDraggedFileState] = useState<{
    files: ProjectGitChangeItem[];
    sectionId: ProjectGitChangesSection["id"];
  } | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [selectedFileKeys, setSelectedFileKeys] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<{
    sectionId: ProjectGitChangesSection["id"];
    path: string;
  } | null>(null);

  const handleFileDragEnd = useCallback(() => {
    setDraggedFileState(null);
    setDragOverSectionId(null);
  }, []);

  const handleFileDragStart = useCallback(
    (event: ReactDragEvent, file: ProjectGitChangeItem, sectionId: ProjectGitChangesSection["id"]) => {
      const clickedFileKey = getFileSelectionKey(sectionId, file.path);
      const selectedFilesInSection = selectedFileKeys.has(clickedFileKey)
        ? (sections.find((section) => section.id === sectionId)?.files ?? []).filter((candidate) =>
            selectedFileKeys.has(getFileSelectionKey(sectionId, candidate.path)),
          )
        : [];
      const files = selectedFilesInSection.length > 0 ? selectedFilesInSection : [file];

      if (selectedFilesInSection.length === 0) {
        setSelectedFileKeys(new Set([clickedFileKey]));
        setSelectionAnchor({ sectionId, path: file.path });
      }

      setDraggedFileState({ files, sectionId });
      if (event.dataTransfer) {
        // Deleted files no longer exist on disk, so they cannot be attached to the
        // composer (or resolved by any external drop target); keep them out of the
        // payload while still allowing section moves via the in-memory drag state.
        const attachableFiles = files.filter((candidate) => candidate.kind !== "deleted");
        const worktreePrefix = worktreePath
          ? worktreePath.endsWith("/")
            ? worktreePath
            : `${worktreePath}/`
          : undefined;
        const toAbsolutePath = (candidate: ProjectGitChangeItem) =>
          worktreePrefix ? `${worktreePrefix}${candidate.path}` : candidate.path;

        // When the worktree root is known every payload path is absolute, whether
        // or not attachable files exist (deleted-only drags stay inert in the
        // composer because no file/uri MIME type is present).
        const payloadPaths = worktreePrefix ? files.map(toAbsolutePath) : files.map((candidate) => candidate.path);

        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData("text/plain", payloadPaths.join("\n"));
        if (worktreePrefix && attachableFiles.length > 0) {
          const entries = attachableFiles.map((candidate) => ({
            path: toAbsolutePath(candidate),
            isDirectory: false,
          }));
          event.dataTransfer.setData(FILETREE_DRAG_MIME, JSON.stringify(entries));
          // Standard text/uri-list fallback: the custom MIME above is dropped when
          // a drag crosses an OS-level boundary (e.g. between panes in some
          // Electron/Chromium versions), while text/uri-list survives. The composer
          // accepts it via the external-file path and still attaches the files.
          event.dataTransfer.setData(
            "text/uri-list",
            attachableFiles.map((candidate) => toFileUri(toAbsolutePath(candidate))).join("\r\n"),
          );
        }
      }
    },
    [sections, selectedFileKeys, worktreePath],
  );

  const handleSectionDragOver = useCallback(
    (event: ReactDragEvent, targetSectionId: ProjectGitChangesSection["id"]) => {
      if (!draggedFileState || !canMoveFileBetweenSections(draggedFileState.sectionId, targetSectionId)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      if (dragOverSectionId !== targetSectionId) {
        setDragOverSectionId(targetSectionId);
      }
    },
    [dragOverSectionId, draggedFileState],
  );

  const handleSectionDrop = useCallback(
    (event: ReactDragEvent, targetSectionId: ProjectGitChangesSection["id"]) => {
      event.preventDefault();
      if (!draggedFileState || !canMoveFileBetweenSections(draggedFileState.sectionId, targetSectionId)) {
        handleFileDragEnd();
        return;
      }

      if (onMoveFiles) {
        onMoveFiles(draggedFileState.files, draggedFileState.sectionId, targetSectionId);
      } else if (draggedFileState.files[0]) {
        onMoveFile?.(draggedFileState.files[0], draggedFileState.sectionId, targetSectionId);
      }
      handleFileDragEnd();
    },
    [draggedFileState, handleFileDragEnd, onMoveFile, onMoveFiles],
  );

  const handleFileClick = useCallback(
    (event: ReactMouseEvent, file: ProjectGitChangeItem, section: ProjectGitChangesSection) => {
      const clickedFileKey = getFileSelectionKey(section.id, file.path);
      if (event.shiftKey) {
        if (!selectionAnchor || selectionAnchor.sectionId !== section.id) {
          setSelectedFileKeys(new Set([clickedFileKey]));
          setSelectionAnchor({ sectionId: section.id, path: file.path });
          return;
        }

        const anchorIndex = section.files.findIndex((candidate) => candidate.path === selectionAnchor.path);
        const targetIndex = section.files.findIndex((candidate) => candidate.path === file.path);
        if (anchorIndex < 0 || targetIndex < 0) {
          setSelectedFileKeys(new Set([clickedFileKey]));
          setSelectionAnchor({ sectionId: section.id, path: file.path });
          return;
        }

        const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        const nextSelection = new Set<string>();
        for (let index = start; index <= end; index += 1) {
          const rangeFile = section.files[index];
          if (rangeFile) {
            nextSelection.add(getFileSelectionKey(section.id, rangeFile.path));
          }
        }

        setSelectedFileKeys(nextSelection);
        return;
      }

      setSelectedFileKeys(new Set([clickedFileKey]));
      setSelectionAnchor({ sectionId: section.id, path: file.path });
      onSelectFile?.(file);
    },
    [onSelectFile, selectionAnchor],
  );

  return {
    dragOverSectionId,
    selectedFileKeys,
    handleFileClick,
    handleFileDragEnd,
    handleFileDragStart,
    handleSectionDragOver,
    handleSectionDrop,
  };
}
