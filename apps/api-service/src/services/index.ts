import type { AppDb } from "@/db/client";
import { AuthService } from "@/services/auth-service";
import { JobEvaluatorService } from "@/services/job-evaluator-service";
import { NodeService } from "@/services/node-service";
import { OrganizationService } from "@/services/organization-service";
import { ProjectService } from "@/services/project-service";
import { ScheduledJobService } from "@/services/scheduled-job-service";
import { UserService } from "@/services/user-service";
import { NoopWorkspaceProvisioner } from "@/services/workspace-provisioner";
import { WorkspacePullRequestService } from "@/services/workspace-pull-request-service";
import { WorkspaceService } from "@/services/workspace-service";
import type { ServiceConfig } from "@/types";

export type AppServices = {
  user: UserService;
  auth: AuthService;
  organization: OrganizationService;
  node: NodeService;
  project: ProjectService;
  scheduledJob: ScheduledJobService;
  jobEvaluator: JobEvaluatorService;
  workspace: WorkspaceService;
  workspacePullRequest: WorkspacePullRequestService;
};

export function createServices(deps: { db: AppDb; config: ServiceConfig }): AppServices {
  const user = new UserService(deps.db);
  const organization = new OrganizationService(deps.db);
  const workspaceProvisioner = new NoopWorkspaceProvisioner();

  return {
    user,
    auth: new AuthService(deps.db, deps.config, user),
    organization,
    node: new NodeService(deps.db, organization, deps.config),
    project: new ProjectService(deps.db, organization),
    scheduledJob: new ScheduledJobService(deps.db, organization),
    jobEvaluator: new JobEvaluatorService(deps.db),
    workspace: new WorkspaceService(deps.db, organization, workspaceProvisioner),
    workspacePullRequest: new WorkspacePullRequestService(deps.db, organization),
  };
}
