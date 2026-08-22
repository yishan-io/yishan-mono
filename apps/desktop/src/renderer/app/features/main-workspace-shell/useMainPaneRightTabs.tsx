import { Badge } from "@mui/material";
import type { RightPaneTabDef } from "@renderer/domains/workbench";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LuFolderTree, LuGitBranch, LuGitPullRequest, LuListTodo } from "react-icons/lu";

/** Builds the right-pane tab registration for the selected workspace capabilities and counts. */
export function useMainPaneRightTabs(input: {
  gitCapable: boolean;
  changesCount: number;
  workspaceTaskCount: number;
}): RightPaneTabDef[] {
  const { t } = useTranslation();
  return useMemo(() => {
    const tabs: RightPaneTabDef[] = [
      {
        value: "files",
        label: t("files.files"),
        shortcutId: "activate-files-pane",
        icon: <LuFolderTree size={18} />,
      },
      {
        value: "tasks",
        label: t("localTask.title"),
        shortcutId: "activate-tasks-pane",
        icon: (
          <Badge
            badgeContent={input.workspaceTaskCount}
            color="primary"
            max={99}
            invisible={input.workspaceTaskCount <= 0}
          >
            <LuListTodo size={18} />
          </Badge>
        ),
      },
    ];
    if (input.gitCapable) {
      tabs.push(
        {
          value: "changes",
          label: t("files.changes"),
          shortcutId: "activate-changes-pane",
          icon: (
            <Badge
              badgeContent={input.changesCount}
              color="primary"
              max={99}
              invisible={input.changesCount <= 0}
              sx={{ "& .MuiBadge-badge": { minWidth: 14, height: 14, fontSize: 9, lineHeight: 1 } }}
            >
              <LuGitBranch size={18} />
            </Badge>
          ),
        },
        {
          value: "pr",
          label: t("workspace.pr.tab"),
          shortcutId: "activate-pr-pane",
          icon: <LuGitPullRequest size={18} />,
        },
      );
    }
    return tabs;
  }, [input.changesCount, input.gitCapable, input.workspaceTaskCount, t]);
}
