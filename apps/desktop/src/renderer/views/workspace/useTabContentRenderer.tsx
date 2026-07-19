import { Box, Typography } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileDiffViewer } from "../../components/FileDiffViewer";
import { FileEditor } from "../../components/FileEditor";
import { ImagePreview } from "../../components/ImagePreview";
import { MultiFileDiffViewer } from "../../components/MultiFileDiffViewer";
import { TabPanel } from "../../components/TabPanel";
import { UnsupportedFileView } from "../../components/UnsupportedFileView";
import { copyToClipboard } from "../../helpers/clipboard";
import type { Commands } from "../../hooks/useCommands";
import { layoutStore } from "../../store/settings/layoutStore";
import type { WorkspaceTab } from "../../store/types";
import { AgentChatView } from "./AgentChatView";
import { BrowserView } from "./browser/BrowserView";
import { TerminalView } from "./terminal/TerminalView";

type TabContentRendererProps = {
  workspace: { worktreePath?: string } | undefined;
  externalAppLabel: string;
  focusContentRequestKey: number;
  cmd: Commands;
  onOpenExternalApp: (filePath: string) => Promise<void>;
};

type RenderTabContent = (tab: WorkspaceTab, isSelected: boolean, isInActivePane: boolean) => React.ReactNode;

/** Returns a stable callback that renders the content panel for one workspace tab. */
export function useTabContentRenderer({
  workspace,
  externalAppLabel,
  focusContentRequestKey,
  cmd,
  onOpenExternalApp,
}: TabContentRendererProps): RenderTabContent {
  const { t } = useTranslation();
  const markdownDefaultViewMode = layoutStore((state) => state.markdownDefaultViewMode);

  return useCallback(
    (tab: WorkspaceTab, isSelected: boolean, isInActivePane: boolean) => {
      const shouldFocusContent = isSelected && isInActivePane;

      if (tab.kind === "diff") {
        if (tab.data.files && tab.data.files.length > 0) {
          return (
            <TabPanel key={tab.id} active={isSelected}>
              <MultiFileDiffViewer
                files={tab.data.files}
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

        return (
          <TabPanel key={tab.id} active={isSelected}>
            <FileDiffViewer
              filePath={tab.data.path}
              oldContent={tab.data.oldContent ?? ""}
              newContent={tab.data.newContent ?? ""}
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
        if (tab.data.isUnsupported) {
          return (
            <TabPanel key={tab.id} active={isSelected}>
              <UnsupportedFileView
                path={tab.data.path}
                title={t("files.unsupported.title")}
                description={
                  tab.data.unsupportedReason === "size"
                    ? t("files.unsupported.descriptionLarge")
                    : t("files.unsupported.description")
                }
                hint={
                  tab.data.unsupportedReason === "size" ? t("files.unsupported.hintLarge") : t("files.unsupported.hint")
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
              content={tab.data.content ?? ""}
              worktreePath={workspace?.worktreePath}
              isDeleted={Boolean(tab.data.isDeleted)}
              isIgnored={Boolean(tab.data.isIgnored)}
              defaultMarkdownViewMode={markdownDefaultViewMode}
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

      if (tab.kind === "session") {
        return (
          <TabPanel key={tab.id} active={isSelected}>
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Chat is currently disabled.
              </Typography>
            </Box>
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
            <TerminalView tabId={tab.id} focusRequestKey={shouldFocusContent ? focusContentRequestKey : 0} />
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
            />
          </Box>
        );
      }

      return null;
    },
    [t, cmd, workspace, externalAppLabel, onOpenExternalApp, focusContentRequestKey, markdownDefaultViewMode],
  );
}
