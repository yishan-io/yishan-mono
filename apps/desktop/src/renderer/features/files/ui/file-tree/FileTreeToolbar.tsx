import { Box, IconButton, Tooltip } from "@mui/material";
import { useCallback, useRef, useState } from "react";
import { LuChevronDown, LuFilePlus2, LuFolderPlus, LuRefreshCw } from "react-icons/lu";
import {
  EXTERNAL_APP_MENU_ENTRIES,
  type ExternalAppId,
  type ExternalAppMenuEntry,
  findExternalAppPreset,
} from "../../../../../shared/contracts/externalApps";
import { ContextMenu } from "../../../../components/ContextMenu";
import type { ContextMenuEntry } from "../../../../components/ContextMenu";

type FileTreeToolbarProps = {
  createFileActionLabel: string;
  createFolderActionLabel: string;
  refreshActionLabel: string;
  canCreateFile: boolean;
  canCreateFolder: boolean;
  canRefresh: boolean;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  /** When false the open-in-app selector is hidden entirely. */
  canOpenInExternalApp?: boolean;
  /** The last-used external app preset (or Finder), shown as the selector button icon. */
  lastUsedWorkspaceExternalAppPreset?: { id: string; label: string; iconSrc: string } | null;
  /** Tooltip for the open-in-app selector button. */
  openInAppLabel?: string;
  /** Available external-app menu entries after host detection/filtering. */
  externalAppMenuEntries?: readonly ExternalAppMenuEntry[];
  /** Label for the "Show in Finder/Explorer" dropdown item. */
  openInFileManagerLabel?: string;
  onOpenInExternalApp?: (appId: ExternalAppId) => void;
  onOpenInFileManager?: () => void;
};

/** Renders the file-tree toolbar actions for create file, create folder, refresh, and open-in-external-app selector. */
export function FileTreeToolbar({
  createFileActionLabel,
  createFolderActionLabel,
  refreshActionLabel,
  canCreateFile,
  canCreateFolder,
  canRefresh,
  onCreateFile,
  onCreateFolder,
  onRefresh,
  canOpenInExternalApp = false,
  lastUsedWorkspaceExternalAppPreset,
  openInAppLabel,
  externalAppMenuEntries = EXTERNAL_APP_MENU_ENTRIES,
  openInFileManagerLabel,
  onOpenInExternalApp,
  onOpenInFileManager,
}: FileTreeToolbarProps) {
  const dropdownAnchorRef = useRef<HTMLButtonElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleCloseDropdown = useCallback(() => {
    setDropdownOpen(false);
  }, []);

  const handleSelectApp = useCallback(
    (appId: ExternalAppId) => {
      setDropdownOpen(false);
      onOpenInExternalApp?.(appId);
    },
    [onOpenInExternalApp],
  );

  const dropdownMenuItems = buildOpenInAppMenuItems(handleSelectApp, {
    externalAppMenuEntries,
    openInFileManagerLabel,
    onOpenInFileManager,
  });

  const selectedPreset = lastUsedWorkspaceExternalAppPreset;
  const selectedIcon = selectedPreset ? (
    <Box
      component="img"
      src={selectedPreset.iconSrc}
      alt={selectedPreset.label}
      sx={{ width: 20, height: 20, flexShrink: 0 }}
    />
  ) : (
    <Box component="img" src="app-icons/finder.png" alt="Finder" sx={{ width: 20, height: 20, flexShrink: 0 }} />
  );

  const handleDirectOpen = useCallback(() => {
    if (!selectedPreset) {
      // Default: open in Finder
      onOpenInFileManager?.();
      return;
    }
    if (selectedPreset.id === "system-file-manager") {
      onOpenInFileManager?.();
      return;
    }
    onOpenInExternalApp?.(selectedPreset.id as ExternalAppId);
  }, [selectedPreset, onOpenInExternalApp, onOpenInFileManager]);

  const directOpenTooltip = selectedPreset
    ? `${openInAppLabel ?? "Open in…"} (${selectedPreset.label})`
    : (openInFileManagerLabel ?? "Show in Finder");
  const dropdownTooltip = openInAppLabel ?? "Choose app…";

  return (
    <Box
      data-testid="repo-file-tree-toolbar"
      sx={{
        minHeight: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 0.5,
        pr: 3,
        my: 1.1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Tooltip title={createFileActionLabel}>
          <span>
            <IconButton aria-label={createFileActionLabel} onClick={onCreateFile} disabled={!canCreateFile}>
              <LuFilePlus2 size={16} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={createFolderActionLabel}>
          <span>
            <IconButton aria-label={createFolderActionLabel} onClick={onCreateFolder} disabled={!canCreateFolder}>
              <LuFolderPlus size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={refreshActionLabel}>
          <span>
            <IconButton aria-label={refreshActionLabel} onClick={onRefresh} disabled={!canRefresh}>
              <LuRefreshCw size={16} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {canOpenInExternalApp && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Tooltip title={directOpenTooltip}>
              <IconButton
                aria-label={directOpenTooltip}
                onClick={handleDirectOpen}
                sx={{
                  borderRadius: 0,
                  px: 0.5,
                }}
              >
                {selectedIcon}
              </IconButton>
            </Tooltip>
            <Box sx={{ width: 1, alignSelf: "stretch", bgcolor: "divider" }} />
            <Tooltip title={dropdownTooltip}>
              <IconButton
                ref={dropdownAnchorRef}
                aria-label={dropdownTooltip}
                onClick={() => {
                  setDropdownOpen(true);
                }}
                sx={{
                  borderRadius: 0,
                  px: 0.25,
                }}
              >
                <LuChevronDown size={12} />
              </IconButton>
            </Tooltip>
          </Box>
          <ContextMenu
            open={dropdownOpen}
            onClose={handleCloseDropdown}
            anchorEl={dropdownOpen ? dropdownAnchorRef.current : null}
            items={dropdownMenuItems}
            paperSx={{ minWidth: 180 }}
          />
        </>
      )}
    </Box>
  );
}

function buildOpenInAppMenuItems(
  onSelect: (appId: ExternalAppId) => void,
  opts?: {
    externalAppMenuEntries?: readonly ExternalAppMenuEntry[];
    openInFileManagerLabel?: string;
    onOpenInFileManager?: () => void;
  },
): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];

  // System file manager (Finder / Explorer)
  if (opts?.openInFileManagerLabel && opts?.onOpenInFileManager) {
    items.push({
      id: "system-file-manager",
      label: opts.openInFileManagerLabel,
      icon: <Box component="img" src="app-icons/finder.png" alt="" sx={{ width: 16, height: 16 }} />,
      onSelect: () => {
        opts.onOpenInFileManager?.();
      },
    });
  }

  for (const entry of opts?.externalAppMenuEntries ?? EXTERNAL_APP_MENU_ENTRIES) {
    if (entry.kind === "app") {
      const preset = findExternalAppPreset(entry.appId);
      if (!preset) {
        continue;
      }
      items.push({
        id: preset.id,
        label: preset.label,
        icon: <Box component="img" src={preset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
        onSelect: () => {
          onSelect(preset.id);
        },
      });
    } else {
      // JetBrains group
      const childItems: ContextMenuEntry[] = [];
      for (const appId of entry.appIds) {
        const preset = findExternalAppPreset(appId);
        if (!preset) {
          continue;
        }
        childItems.push({
          id: preset.id,
          label: preset.label,
          icon: <Box component="img" src={preset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
          onSelect: () => {
            onSelect(preset.id);
          },
        });
      }
      items.push({
        id: `group-${entry.id}`,
        label: entry.label,
        icon: <Box component="img" src={entry.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
        items: childItems,
      });
    }
  }

  return items;
}
