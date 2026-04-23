import {
  Box,
  ButtonBase,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, useState } from "react";
import { LuChevronDown, LuChevronRight, LuCopy, LuCornerUpLeft, LuMinus, LuPlus } from "react-icons/lu";
import { GitChangeTotals } from "./GitChangeTotals";

export type ProjectGitChangeKind = "added" | "modified" | "deleted";

export type ProjectGitChangeItem = {
  path: string;
  kind: ProjectGitChangeKind;
  additions: number;
  deletions: number;
};

export type ProjectGitChangesSection = {
  id: string;
  label: string;
  files: ProjectGitChangeItem[];
};

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

type FolderGroup = {
  folder: string;
  files: ProjectGitChangeItem[];
};

/** Returns one icon/color pair for one git change kind badge. */
function getChangeColors(kind: ProjectGitChangeKind, sectionId: string) {
  if (sectionId === "untracked") {
    return { icon: "?", color: "info.main" };
  }

  if (kind === "added") {
    return { icon: "+", color: "success.main" };
  }

  if (kind === "deleted") {
    return { icon: "-", color: "error.main" };
  }

  return { icon: "●", color: "warning.light" };
}

/** Groups changed files by parent folder so list rows stay compact. */
function groupByFolder(files: ProjectGitChangeItem[]): FolderGroup[] {
  const groups = new Map<string, RepoGitChangeItem[]>();

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

/** Resolves label and icon used for track/unstage actions per section. */
function getTrackActionMeta(sectionId: string) {
  if (sectionId === "staged") {
    return {
      verb: "Unstage",
      SectionIcon: LuMinus,
      FileIcon: LuMinus,
    };
  }

  return {
    verb: "Stage",
    SectionIcon: LuPlus,
    FileIcon: LuPlus,
  };
}

/** Returns whether one section should render revert actions. */
function shouldShowRevertAction(sectionId: string) {
  return sectionId !== "staged";
}

/** Resolves section-specific wording for destructive restore actions. */
function getRestoreActionVerb(sectionId: string) {
  return sectionId === "untracked" ? "Discard" : "Revert";
}

/** Returns whether one drag/drop move between sections maps to a valid git action. */
function canMoveFileBetweenSections(sourceSectionId: string, targetSectionId: string) {
  if (sourceSectionId === targetSectionId) {
    return false;
  }

  if (targetSectionId === "staged") {
    return sourceSectionId !== "staged";
  }

  return sourceSectionId === "staged";
}

/** Builds one stable selection key from section and path values. */
function getFileSelectionKey(sectionId: string, path: string) {
  return `${sectionId}::${path}`;
}

/** Builds one stable collapse key for a folder group inside a section. */
function getFolderCollapseKey(sectionId: string, folder: string) {
  return `${sectionId}::${folder}`;
}

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
  const [contextMenuState, setContextMenuState] = useState<{
    file: ProjectGitChangeItem;
    sectionId: ProjectGitChangesSection["id"];
    top: number;
    left: number;
  } | null>(null);
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
  const visibleSections = sections.filter((section) => section.files.length > 0);
  const [collapsedFolderKeys, setCollapsedFolderKeys] = useState<Set<string>>(new Set());
  const isContextMenuFileStaged = contextMenuState?.sectionId === "staged";
  const shouldShowContextMenu = Boolean(
    onCopyFilePath || onCopyRelativeFilePath || (!readOnly && (onTrackFile || onRevertFile)),
  );

  const toggleSection = (sectionId: string) => {
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  };

  /** Toggles one folder group visibility inside a section. */
  const toggleFolder = (sectionId: string, folder: string) => {
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
  };

  /** Opens one file-row context menu at the pointer position. */
  const handleFileContextMenu = (
    event: ReactMouseEvent,
    file: ProjectGitChangeItem,
    sectionId: ProjectGitChangesSection["id"],
  ) => {
    event.preventDefault();
    setContextMenuState({
      file,
      sectionId,
      top: event.clientY,
      left: event.clientX,
    });
  };

  /** Closes the context menu and clears selected file metadata. */
  const closeContextMenu = () => {
    setContextMenuState(null);
  };

  /** Starts one file drag operation and records source metadata. */
  const handleFileDragStart = (
    event: ReactDragEvent,
    file: ProjectGitChangeItem,
    sectionId: ProjectGitChangesSection["id"],
  ) => {
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
  };

  /** Clears transient drag state after drag completes or is cancelled. */
  const handleFileDragEnd = () => {
    setDraggedFileState(null);
    setDragOverSectionId(null);
  };

  /** Enables dropping on sections only when one valid git state transition exists. */
  const handleSectionDragOver = (event: ReactDragEvent, targetSectionId: RepoGitChangesSection["id"]) => {
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
  };

  /** Applies one section drop operation by delegating to the parent handler. */
  const handleSectionDrop = (event: ReactDragEvent, targetSectionId: RepoGitChangesSection["id"]) => {
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
  };

  /** Handles click selection, including section-local shift-range selection. */
  const handleFileClick = (event: ReactMouseEvent, file: RepoGitChangeItem, section: RepoGitChangesSection) => {
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
  };

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
            <Box
              sx={{
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                "&:hover .section-actions, &:focus-within .section-actions": {
                  opacity: 1,
                  pointerEvents: "auto",
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                <ButtonBase
                  disableRipple
                  onClick={() => toggleSection(section.id)}
                  aria-label={isCollapsed ? `Expand ${section.label}` : `Collapse ${section.label}`}
                  sx={{
                    width: 18,
                    height: 18,
                    mr: 0.75,
                    color: "text.secondary",
                    borderRadius: 0.5,
                  }}
                >
                  {isCollapsed ? <LuChevronRight size={12} /> : <LuChevronDown size={12} />}
                </ButtonBase>

                <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 400 }}>
                  {section.label}
                  <Box component="span" sx={{ ml: 1, color: "text.secondary", fontWeight: 400 }}>
                    {section.files.length}
                  </Box>
                </Typography>
              </Box>

              {readOnly ? null : (
                <Box
                  className="section-actions"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                    color: "text.secondary",
                    opacity: 0,
                    pointerEvents: "none",
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {showRevertAction ? (
                    <Tooltip title={`${restoreActionVerb} all`} arrow placement="top">
                      <ButtonBase
                        disableRipple
                        aria-label={`${restoreActionVerb} ${section.label}`}
                        sx={{ width: 18, height: 18, borderRadius: 0.5 }}
                        onClick={() => onRevertSection?.(section)}
                      >
                        <LuCornerUpLeft size={12} />
                      </ButtonBase>
                    </Tooltip>
                  ) : null}
                  <Tooltip title={`${trackActionMeta.verb} all`} arrow placement="top">
                    <ButtonBase
                      disableRipple
                      aria-label={`${trackActionMeta.verb} ${section.label}`}
                      sx={{ width: 18, height: 18, borderRadius: 0.5 }}
                      onClick={() => onTrackSection?.(section)}
                    >
                      <trackActionMeta.SectionIcon size={13} />
                    </ButtonBase>
                  </Tooltip>
                </Box>
              )}
            </Box>

            {isCollapsed
              ? null
              : groupedFolders.map((group) => (
                  <Box key={`${section.id}-${group.folder}`} sx={{ mb: 0.5 }}>
                    {(() => {
                      const canFoldFolder = section.id === "untracked" && group.folder !== ".";
                      const folderCollapseKey = getFolderCollapseKey(section.id, group.folder);
                      const isFolderCollapsed = canFoldFolder && collapsedFolderKeys.has(folderCollapseKey);

                      return (
                        <>
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
                                    disableRipple
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
                              sx={
                                group.folder === "." ? undefined : { borderLeft: 1, borderColor: "divider", ml: 0.75 }
                              }
                            >
                              {group.files.map((file) => {
                                const fileName = file.path.split("/").pop() ?? file.path;
                                const indicator = getChangeColors(file.kind, section.id);
                                const fileSelectionKey = getFileSelectionKey(section.id, file.path);
                                const isSelected = selectedFileKeys.has(fileSelectionKey);

                                return (
                                  <Box
                                    key={`${section.id}-${file.path}`}
                                    data-testid={`changes-file-${section.id}-${file.path}`}
                                    onContextMenu={
                                      shouldShowContextMenu
                                        ? (event) => handleFileContextMenu(event, file, section.id)
                                        : undefined
                                    }
                                    draggable={!readOnly}
                                    onDragStart={
                                      readOnly ? undefined : (event) => handleFileDragStart(event, file, section.id)
                                    }
                                    onDragEnd={readOnly ? undefined : handleFileDragEnd}
                                    sx={{
                                      minHeight: 30,
                                      minWidth: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      borderRadius: 1,
                                      bgcolor: isSelected ? "action.selected" : undefined,
                                      "&:hover": { bgcolor: "action.hover" },
                                      "&:hover .file-actions, &:focus-within .file-actions": {
                                        opacity: 1,
                                        pointerEvents: "auto",
                                      },
                                    }}
                                  >
                                    <ButtonBase
                                      disableRipple
                                      onClick={(event) => handleFileClick(event, file, section)}
                                      sx={{
                                        minHeight: 30,
                                        flex: 1,
                                        minWidth: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        px: 0.75,
                                        justifyContent: "flex-start",
                                      }}
                                    >
                                      <Box sx={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                                        <Box
                                          data-testid={`changes-file-indicator-${section.id}-${file.path}`}
                                          sx={{
                                            width: 14,
                                            height: 14,
                                            border: 1,
                                            borderColor: indicator.color,
                                            borderRadius: 0.5,
                                            color: indicator.color,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 10,
                                            mr: 1,
                                            flexShrink: 0,
                                          }}
                                        >
                                          {indicator.icon}
                                        </Box>

                                        <Typography
                                          variant="body2"
                                          data-testid={`changes-file-name-${section.id}-${file.path}`}
                                          title={file.path}
                                          sx={{
                                            flex: 1,
                                            fontSize: 12,
                                            minWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            textAlign: "left",
                                          }}
                                        >
                                          {fileName}
                                        </Typography>

                                        {file.additions > 0 || file.deletions > 0 ? (
                                          <GitChangeTotals
                                            testId={`changes-file-stats-${section.id}-${file.path}`}
                                            additions={file.additions}
                                            deletions={file.deletions}
                                            hideZeroSides
                                            sx={{ ml: 1, flexShrink: 0 }}
                                          />
                                        ) : null}
                                      </Box>
                                    </ButtonBase>

                                    {readOnly ? null : (
                                      <Box
                                        className="file-actions"
                                        sx={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 0.25,
                                          pr: 0.5,
                                          opacity: 0,
                                          pointerEvents: "none",
                                          transition: "opacity 0.15s ease",
                                        }}
                                      >
                                        {showRevertAction ? (
                                          <Tooltip title={`${restoreActionVerb} file`} arrow placement="top">
                                            <IconButton
                                              size="small"
                                              aria-label={`${restoreActionVerb} ${file.path}`}
                                              onClick={() => onRevertFile?.(file)}
                                            >
                                              <LuCornerUpLeft size={12} />
                                            </IconButton>
                                          </Tooltip>
                                        ) : null}
                                        <Tooltip title={`${trackActionMeta.verb} file`} arrow placement="top">
                                          <IconButton
                                            size="small"
                                            aria-label={`${trackActionMeta.verb} ${file.path}`}
                                            onClick={() => onTrackFile?.(file, section.id)}
                                          >
                                            <trackActionMeta.FileIcon size={12} />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                    )}
                                  </Box>
                                );
                              })}
                            </Box>
                          )}
                        </>
                      );
                    })()}
                  </Box>
                ))}
          </Box>
        );
      })}
      <Menu
        open={Boolean(contextMenuState) && shouldShowContextMenu}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenuState
            ? {
                top: contextMenuState.top,
                left: contextMenuState.left,
              }
            : undefined
        }
      >
        {!readOnly && !isContextMenuFileStaged ? (
          <MenuItem
            onClick={() => {
              if (contextMenuState) {
                onRevertFile?.(contextMenuState.file);
              }
              closeContextMenu();
            }}
          >
            <ListItemIcon>
              <LuCornerUpLeft size={14} />
            </ListItemIcon>
            <ListItemText>Discard</ListItemText>
          </MenuItem>
        ) : null}
        {!readOnly && isContextMenuFileStaged ? (
          <MenuItem
            onClick={() => {
              if (contextMenuState) {
                onTrackFile?.(contextMenuState.file, "staged");
              }
              closeContextMenu();
            }}
          >
            <ListItemIcon>
              <LuMinus size={14} />
            </ListItemIcon>
            <ListItemText>Unstage</ListItemText>
          </MenuItem>
        ) : !readOnly ? (
          <MenuItem
            onClick={() => {
              if (contextMenuState) {
                onTrackFile?.(contextMenuState.file, contextMenuState.sectionId);
              }
              closeContextMenu();
            }}
          >
            <ListItemIcon>
              <LuPlus size={14} />
            </ListItemIcon>
            <ListItemText>Stage</ListItemText>
          </MenuItem>
        ) : null}
        {onCopyFilePath || onCopyRelativeFilePath ? <Divider component="li" /> : null}
        <MenuItem
          onClick={() => {
            if (contextMenuState) {
              onCopyFilePath?.(contextMenuState.file);
            }
            closeContextMenu();
          }}
        >
          <ListItemIcon>
            <LuCopy size={14} />
          </ListItemIcon>
          <ListItemText>Copy File Path</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenuState) {
              onCopyRelativeFilePath?.(contextMenuState.file);
            }
            closeContextMenu();
          }}
        >
          <ListItemIcon>
            <LuCopy size={14} />
          </ListItemIcon>
          <ListItemText>Copy Relative Path</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
