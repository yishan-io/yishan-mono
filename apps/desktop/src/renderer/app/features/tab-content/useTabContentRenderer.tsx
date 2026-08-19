import { Box, Typography } from "@mui/material";
import { AgentChatView } from "@renderer/domains/agent";
import { BrowserView } from "@renderer/domains/browser";
import { useFileTabContents } from "@renderer/domains/files";
import {
  AudioPreview,
  FileDiffViewer,
  FileEditor,
  ImagePreview,
  MultiFileDiffViewer,
  UnsupportedFileView,
  VideoPreview,
} from "@renderer/domains/files";
import { useDiffTabContents } from "@renderer/domains/git";
import { TerminalView } from "@renderer/domains/terminal";
import { TabPanel } from "@renderer/domains/workbench";
import type { WorkbenchTab } from "@renderer/domains/workbench";
import { copyToClipboard } from "@renderer/platform/clipboard";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { FileCommandSurface, WorkbenchCommandSurface } from "../../commands/useCommands";

type TabContentRendererProps = {
  workspace: { worktreePath?: string } | undefined;
  externalAppLabel: string;
  focusContentRequestKey: number;
  cmd: WorkbenchCommandSurface & FileCommandSurface;
  onOpenExternalApp: (filePath: string) => Promise<void>;
};

type RenderTabContent = (tab: WorkbenchTab, isSelected: boolean, isInActivePane: boolean) => React.ReactNode;

/** Returns a stable callback that renders the content panel for one workspace tab. */
export function useTabContentRenderer({
  workspace,
  externalAppLabel,
  focusContentRequestKey,
  cmd,
  onOpenExternalApp,
}: TabContentRendererProps): RenderTabContent {
  const { t } = useTranslation();
  // File/diff content lives in the owning module stores (W6 task 16); the
  // renderer subscribes here so content updates re-render the active tab.
  const fileTabContents = useFileTabContents();
  const diffTabContents = useDiffTabContents();

  return useCallback(
    (tab: WorkbenchTab, isSelected: boolean, isInActivePane: boolean) => {
      const shouldFocusContent = isSelected && isInActivePane;
      const fileContent = fileTabContents[tab.id];
      const diffContent = diffTabContents[tab.id];

      if (tab.kind === "diff") {
        if (diffContent?.files && diffContent.files.length > 0) {
          return (
            <TabPanel key={tab.id} active={isSelected}>
              <MultiFileDiffViewer
                files={diffContent.files}
                onOpenFile={(filePath) => {
                  // Pre-load the file content so the tab never renders the
                  // placeholder body while the async read completes.
                  void cmd
                    .readFile({ workspaceId: tab.workspaceId, relativePath: filePath })
                    .then((response) => {
                      cmd.openTab({
                        workspaceId: tab.workspaceId,
                        kind: "file",
                        path: filePath,
                        content: response.content,
                        temporary: true,
                      });
                    })
                    .catch((error) => {
                      // Diff files may not exist on disk anymore (added/deleted
                      // entries). Open the tab anyway — the auto-refresh marks
                      // it deleted when the file is really missing.
                      console.error("Failed to pre-load workspace file from diff view", getErrorMessage(error));
                      cmd.openTab({
                        workspaceId: tab.workspaceId,
                        kind: "file",
                        path: filePath,
                        temporary: true,
                      });
                    });
                }}
              />
            </TabPanel>
          );
        }

        return (
          <TabPanel key={tab.id} active={isSelected}>
            <FileDiffViewer
              filePath={tab.data.path}
              oldContent={diffContent?.oldContent ?? ""}
              newContent={diffContent?.newContent ?? ""}
              onOpenFile={(filePath) => {
                cmd.openTab({
                  workspaceId: tab.workspaceId,
                  kind: "file",
                  path: filePath,
                  temporary: true,
                });
              }}
            />
          </TabPanel>
        );
      }

      if (tab.kind === "file") {
        if (fileContent?.isUnsupported) {
          return (
            <TabPanel key={tab.id} active={isSelected}>
              <UnsupportedFileView
                path={tab.data.path}
                title={t("files.unsupported.title")}
                description={
                  fileContent.unsupportedReason === "size"
                    ? t("files.unsupported.descriptionLarge")
                    : t("files.unsupported.description")
                }
                hint={
                  fileContent.unsupportedReason === "size"
                    ? t("files.unsupported.hintLarge")
                    : t("files.unsupported.hint")
                }
                onCopyPath={copyToClipboard}
                onOpenExternalApp={onOpenExternalApp}
                openExternalAppLabel={externalAppLabel}
              />
            </TabPanel>
          );
        }

        return (
          <TabPanel key={tab.id} active={isSelected}>
            <FileEditor
              workspaceId={tab.workspaceId}
              path={tab.data.path}
              content={fileContent?.content ?? ""}
              worktreePath={workspace?.worktreePath}
              isDeleted={Boolean(fileContent?.isDeleted)}
              isIgnored={Boolean(fileContent?.isIgnored)}
              focusRequestKey={shouldFocusContent ? focusContentRequestKey : 0}
              onContentChange={(nextContent) => cmd.updateFileTabContent(tab.id, nextContent)}
              onSave={async (nextContent) => {
                const workspaceWorktreePath = workspace?.worktreePath;
                if (!workspaceWorktreePath || !tab.workspaceId) return;
                try {
                  await cmd.writeFile({
                    workspaceId: tab.workspaceId,
                    relativePath: tab.data.path,
                    content: nextContent,
                  });
                  cmd.updateFileTabContent(tab.id, nextContent);
                  cmd.markFileTabSaved(tab.id);
                } catch (error) {
                  console.error("Failed to save workspace file", error);
                }
              }}
              onCopyPath={copyToClipboard}
              onOpenExternalApp={onOpenExternalApp}
              openExternalAppLabel={externalAppLabel}
            />
          </TabPanel>
        );
      }

      if (tab.kind === "image") {
        return (
          <TabPanel key={tab.id} active={isSelected}>
            <ImagePreview
              path={tab.data.path}
              dataUrl={tab.data.dataUrl}
              onCopyPath={copyToClipboard}
              onOpenExternalApp={onOpenExternalApp}
              openExternalAppLabel={externalAppLabel}
            />
          </TabPanel>
        );
      }

      if (tab.kind === "video") {
        return (
          <TabPanel key={tab.id} active={isSelected}>
            <VideoPreview
              path={tab.data.path}
              dataUrl={tab.data.dataUrl}
              onCopyPath={copyToClipboard}
              onOpenExternalApp={onOpenExternalApp}
              openExternalAppLabel={externalAppLabel}
            />
          </TabPanel>
        );
      }

      if (tab.kind === "audio") {
        return (
          <TabPanel key={tab.id} active={isSelected}>
            <AudioPreview
              path={tab.data.path}
              dataUrl={tab.data.dataUrl}
              onCopyPath={copyToClipboard}
              onOpenExternalApp={onOpenExternalApp}
              openExternalAppLabel={externalAppLabel}
            />
          </TabPanel>
        );
      }

      if (tab.kind === "browser") {
        return (
          <Box
            key={tab.id}
            sx={{
              position: "absolute",
              inset: 0,
              display: isSelected ? "flex" : "none",
              flexDirection: "column",
            }}
          >
            <BrowserView tabId={tab.id} initialUrl={tab.data.url} />
          </Box>
        );
      }

      if (tab.kind === "terminal") {
        if (!isSelected) {
          return null;
        }
        return (
          <Box key={tab.id} sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <TerminalView
              tabId={tab.id}
              tabData={{
                workspaceId: tab.workspaceId,
                worktreePath: workspace?.worktreePath,
                paneId: tab.data.paneId,
                launchCommand: tab.data.launchCommand,
                agentKind: tab.data.agentKind,
              }}
              focusRequestKey={shouldFocusContent ? focusContentRequestKey : 0}
            />
          </Box>
        );
      }

      if (tab.kind === "agent-chat") {
        return (
          <Box key={tab.id} sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <AgentChatView
              tabId={tab.id}
              workspaceId={tab.workspaceId}
              cwd={tab.data.cwd}
              sessionId={tab.data.sessionId}
              sessionView={tab.data.sessionView}
            />
          </Box>
        );
      }

      return null;
    },
    [t, cmd, workspace, externalAppLabel, onOpenExternalApp, focusContentRequestKey, fileTabContents, diffTabContents],
  );
}
