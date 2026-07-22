import { Box, Button } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuEye } from "react-icons/lu";
import { PaneLoadingBar } from "../../../components/PaneLoadingBar";
import { ProjectCommitComparison } from "../../../components/ProjectCommitComparison";
import { ProjectGitChangesList } from "../../../components/ProjectGitChangesList";
import { useChangesTabActions } from "./useChangesTabActions";
import { useChangesTabState } from "./useChangesTabState";

/** Renders change-related right pane content for comparison scope and file lists. */
export function ChangesTabView() {
  const { t } = useTranslation();
  const {
    selectedWorkspaceWorktreePath,
    selectedWorkspaceSourceBranch,
    isRepoChangesLoading,
    isCommitComparisonLoading,
    selectedComparison,
    selectedWorkspaceId,
    repoCommitComparison,
    visibleChanges,
    isCommitChangesMode,
    refreshChanges,
    selectUncommitted,
    selectAll,
    selectCommit,
  } = useChangesTabState();
  const {
    trackPaths,
    revertPaths,
    unstagePaths,
    selectCommitChangedFile,
    selectWorkspaceFile,
    viewAllDiffs,
    copyFilePath,
    copyRelativeFilePath,
  } = useChangesTabActions({
    selectedWorkspaceId,
    selectedWorkspaceWorktreePath,
    refreshChanges,
  });

  const allFiles = visibleChanges.flatMap((section) => section.files);
  const hasFiles = allFiles.length > 0;

  const handleViewAllDiffs = () => {
    if (!hasFiles) return;
    const commitHash =
      selectedComparison !== "uncommitted" && selectedComparison !== "all" ? selectedComparison : undefined;
    const targetBranch = selectedComparison === "all" ? selectedWorkspaceSourceBranch : undefined;
    void viewAllDiffs(allFiles, isCommitChangesMode, commitHash, targetBranch);
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {isRepoChangesLoading ? (
        <PaneLoadingBar testId="changes-tab-loading-progress" />
      ) : (
        <>
          <Box
            sx={{
              minWidth: 0,
              px: 1.5,
              pt: 1,
              pb: 1,
            }}
          >
            <ProjectCommitComparison
              comparison={repoCommitComparison}
              targetBranch={selectedWorkspaceSourceBranch ?? ""}
              selectedComparison={selectedComparison}
              onSelectUncommitted={selectUncommitted}
              onSelectAll={selectAll}
              onSelectCommit={selectCommit}
              isTargetBranchLoading={isCommitComparisonLoading}
              comparisonScopeAriaLabel={t("files.git.changeScope")}
            />
          </Box>

          {hasFiles && (
            <Box sx={{ px: 1.5, pb: 0.5 }}>
              <Button
                size="small"
                startIcon={<LuEye size={14} />}
                onClick={handleViewAllDiffs}
                variant="text"
                sx={{ fontSize: 12, minWidth: 0, px: 1 }}
              >
                View all diffs
              </Button>
            </Box>
          )}
          <ProjectGitChangesList
            sections={visibleChanges}
            readOnly={isCommitChangesMode}
            onTrackSection={
              isCommitChangesMode
                ? undefined
                : (section) =>
                    void (section.id === "staged"
                      ? unstagePaths(section.files.map((file) => file.path))
                      : trackPaths(section.files.map((file) => file.path)))
            }
            onRevertSection={
              isCommitChangesMode ? undefined : (section) => void revertPaths(section.files.map((file) => file.path))
            }
            onTrackFile={
              isCommitChangesMode
                ? undefined
                : (file, sectionId) =>
                    void (sectionId === "staged" ? unstagePaths([file.path]) : trackPaths([file.path]))
            }
            onMoveFile={(file, sourceSectionId, targetSectionId) => {
              if (isCommitChangesMode || sourceSectionId === targetSectionId) {
                return;
              }

              if (targetSectionId === "staged") {
                void trackPaths([file.path]);
                return;
              }

              if (sourceSectionId === "staged") {
                void unstagePaths([file.path]);
              }
            }}
            onMoveFiles={(files, sourceSectionId, targetSectionId) => {
              if (isCommitChangesMode || sourceSectionId === targetSectionId || files.length === 0) {
                return;
              }

              const relativePaths = files.map((file) => file.path);
              if (targetSectionId === "staged") {
                void trackPaths(relativePaths);
                return;
              }

              if (sourceSectionId === "staged") {
                void unstagePaths(relativePaths);
              }
            }}
            onRevertFile={isCommitChangesMode ? undefined : (file) => void revertPaths([file.path])}
            onCopyFilePath={(file) => copyFilePath(file.path)}
            onCopyRelativeFilePath={(file) => copyRelativeFilePath(file.path)}
            onSelectFile={async (file) => {
              if (isCommitChangesMode) {
                const commitHashForSelection =
                  selectedComparison !== "uncommitted" && selectedComparison !== "all" ? selectedComparison : undefined;
                const targetBranchForAllSelection =
                  selectedComparison === "all" ? selectedWorkspaceSourceBranch : undefined;
                await selectCommitChangedFile(file.path, commitHashForSelection, targetBranchForAllSelection);
                return;
              }

              await selectWorkspaceFile(file);
            }}
          />
        </>
      )}
    </Box>
  );
}
