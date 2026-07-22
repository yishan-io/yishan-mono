import { Box, ButtonBase, Typography } from "@mui/material";
import { type MouseEvent as ReactMouseEvent, useCallback, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { GitChangesContextMenu, type GitChangesContextMenuState } from "./GitChangesContextMenu";
import { GitChangesFileRow } from "./GitChangesFileRow";
import { GitChangesSectionHeader } from "./GitChangesSectionHeader";
import type { ProjectGitChangeItem, ProjectGitChangesSection } from "./ProjectGitChangesList.types";
import {
  getFileSelectionKey,
  getFolderCollapseKey,
  getRestoreActionVerb,
  getTrackActionMeta,
  groupByFolder,
  shouldShowRevertAction,
} from "./projectGitChangesListHelpers";
import { useProjectGitChangesListInteractions } from "./useProjectGitChangesListInteractions";

export type {
  ProjectGitChangeItem,
  ProjectGitChangeKind,
  ProjectGitChangesSection,
} from "./ProjectGitChangesList.types";

type ProjectGitChangesListProps = {
  sections: ProjectGitChangesSection[];
  readOnly?: boolean;
  onSelectFile?: (file: ProjectGitChangeItem) => void;
  onTrackSection?: (section: ProjectGitChangesSection) => void;
  onRevertSection?: (section: ProjectGitChangesSection) => void;
  onTrackFile?: (file: ProjectGitChangeItem, sectionId: ProjectGitChangesSection["id"]) => void;
  onRevertFile?: (file: ProjectGitChangeItem) => void;
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
  onCopyFilePath?: (file: ProjectGitChangeItem) => void;
  onCopyRelativeFilePath?: (file: ProjectGitChangeItem) => void;
};

/** Renders grouped git sections and supports selecting one diff row. */
export function ProjectGitChangesList({
  sections,
  readOnly = false,
  onSelectFile,
  onTrackSection,
  onRevertSection,
  onTrackFile,
  onRevertFile,
  onMoveFile,
  onMoveFiles,
  onCopyFilePath,
  onCopyRelativeFilePath,
}: ProjectGitChangesListProps) {
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [collapsedFolderKeys, setCollapsedFolderKeys] = useState<Set<string>>(new Set());
  const [contextMenuState, setContextMenuState] = useState<GitChangesContextMenuState | null>(null);
  const {
    dragOverSectionId,
    selectedFileKeys,
    handleFileClick,
    handleFileDragEnd,
    handleFileDragStart,
    handleSectionDragOver,
    handleSectionDrop,
  } = useProjectGitChangesListInteractions({
    sections,
    onSelectFile,
    onMoveFile,
    onMoveFiles,
  });
  const visibleSections = sections.filter((section) => section.files.length > 0);
  const shouldShowContextMenu = Boolean(
    onCopyFilePath || onCopyRelativeFilePath || (!readOnly && (onTrackFile || onRevertFile)),
  );

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSectionIds((previous) => {
      const next = new Set(previous);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  }, []);

  const toggleFolder = useCallback((sectionId: string, folder: string) => {
    const folderCollapseKey = getFolderCollapseKey(sectionId, folder);
    setCollapsedFolderKeys((previous) => {
      const next = new Set(previous);

      if (next.has(folderCollapseKey)) {
        next.delete(folderCollapseKey);
      } else {
        next.add(folderCollapseKey);
      }

      return next;
    });
  }, []);

  const handleFileContextMenu = useCallback(
    (event: ReactMouseEvent, file: ProjectGitChangeItem, sectionId: ProjectGitChangesSection["id"]) => {
      event.preventDefault();
      setContextMenuState({
        file,
        sectionId,
        top: event.clientY,
        left: event.clientX,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  return (
    <Box
      data-testid="changes-list-root"
      sx={{ flex: 1, minWidth: 0, minHeight: 0, px: 1.5, py: 1, overflowY: "auto", overflowX: "hidden" }}
    >
      {visibleSections.map((section) => {
        const groupedFolders = groupByFolder(section.files);
        const isCollapsed = collapsedSectionIds.has(section.id);
        const trackActionMeta = getTrackActionMeta(section.id);
        const showRevertAction = shouldShowRevertAction(section.id);
        const restoreActionVerb = getRestoreActionVerb(section.id);

        return (
          <Box
            key={section.id}
            data-testid={`changes-section-${section.id}`}
            onDragOver={readOnly ? undefined : (event) => handleSectionDragOver(event, section.id)}
            onDrop={readOnly ? undefined : (event) => handleSectionDrop(event, section.id)}
            sx={{
              mb: 1.5,
              borderRadius: 1,
              outline: !readOnly && dragOverSectionId === section.id ? 1 : 0,
              outlineColor: "primary.main",
            }}
          >
            <GitChangesSectionHeader
              section={section}
              isCollapsed={isCollapsed}
              readOnly={readOnly}
              onToggle={() => toggleSection(section.id)}
              onTrackSection={onTrackSection}
              onRevertSection={onRevertSection}
            />

            {isCollapsed
              ? null
              : groupedFolders.map((group) => {
                  const canFoldFolder = section.id === "untracked" && group.folder !== ".";
                  const folderCollapseKey = getFolderCollapseKey(section.id, group.folder);
                  const isFolderCollapsed = canFoldFolder && collapsedFolderKeys.has(folderCollapseKey);

                  return (
                    <Box key={`${section.id}-${group.folder}`} sx={{ mb: 0.5 }}>
                      {group.folder === "." ? null : (
                        <Box
                          sx={{
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            color: "text.secondary",
                            minWidth: 0,
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
                            {canFoldFolder ? (
                              <ButtonBase
                                onClick={() => toggleFolder(section.id, group.folder)}
                                aria-label={
                                  isFolderCollapsed
                                    ? `Expand folder ${group.folder}`
                                    : `Collapse folder ${group.folder}`
                                }
                                sx={{
                                  width: 18,
                                  height: 18,
                                  mr: 0.5,
                                  color: "text.secondary",
                                  borderRadius: 0.5,
                                  flexShrink: 0,
                                }}
                              >
                                {isFolderCollapsed ? <LuChevronRight size={12} /> : <LuChevronDown size={12} />}
                              </ButtonBase>
                            ) : null}
                            <Typography
                              variant="body2"
                              title={group.folder}
                              sx={{
                                fontSize: 12,
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {group.folder}
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ ml: 1, flexShrink: 0, fontSize: 12 }}>
                            {group.files.length}
                          </Typography>
                        </Box>
                      )}

                      {isFolderCollapsed ? null : (
                        <Box
                          sx={group.folder === "." ? undefined : { borderLeft: 1, borderColor: "divider", ml: 0.75 }}
                        >
                          {group.files.map((file) => {
                            const fileSelectionKey = getFileSelectionKey(section.id, file.path);
                            const isSelected = selectedFileKeys.has(fileSelectionKey);

                            return (
                              <GitChangesFileRow
                                key={`${section.id}-${file.path}`}
                                file={file}
                                section={section}
                                isSelected={isSelected}
                                readOnly={readOnly}
                                showContextMenu={shouldShowContextMenu}
                                showRevertAction={showRevertAction}
                                trackVerb={trackActionMeta.verb}
                                restoreVerb={restoreActionVerb}
                                TrackIcon={trackActionMeta.FileIcon}
                                onFileClick={handleFileClick}
                                onContextMenu={handleFileContextMenu}
                                onRevertFile={onRevertFile}
                                onTrackFile={onTrackFile}
                                onDragStart={handleFileDragStart}
                                onDragEnd={handleFileDragEnd}
                              />
                            );
                          })}
                        </Box>
                      )}
                    </Box>
                  );
                })}
          </Box>
        );
      })}
      {shouldShowContextMenu ? (
        <GitChangesContextMenu
          menuState={contextMenuState}
          readOnly={readOnly}
          onClose={closeContextMenu}
          onTrackFile={onTrackFile}
          onRevertFile={onRevertFile}
          onCopyFilePath={onCopyFilePath}
          onCopyRelativeFilePath={onCopyRelativeFilePath}
        />
      ) : null}
    </Box>
  );
}
