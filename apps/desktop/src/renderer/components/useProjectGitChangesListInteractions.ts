import { type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, useCallback, useState } from "react";
import type { ProjectGitChangeItem, ProjectGitChangesSection } from "./ProjectGitChangesList.types";
import { canMoveFileBetweenSections, getFileSelectionKey } from "./projectGitChangesListHelpers";

type UseProjectGitChangesListInteractionsParams = {
  sections: ProjectGitChangesSection[];
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

/** Manages file selection and drag/drop interactions for the git changes list. */
export function useProjectGitChangesListInteractions({
  sections,
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
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", files.map((candidate) => candidate.path).join("\n"));
      }
    },
    [sections, selectedFileKeys],
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
