import { useWorkspacePullRequestsTabModel } from "../view-model/useWorkspacePullRequestsTabModel";
import { WorkspacePullRequestsTab } from "./WorkspacePullRequestsTab";

type WorkspacePullRequestsTabPaneProps = {
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export function WorkspacePullRequestsTabPane({
  organizationId,
  projectId,
  workspaceId,
}: WorkspacePullRequestsTabPaneProps) {
  const model = useWorkspacePullRequestsTabModel({
    organizationId,
    projectId,
    workspaceId,
  });

  return <WorkspacePullRequestsTab model={model} />;
}
