import type { AppDb, AppDbWs } from "@/db/client";
import type { ServiceConfig } from "@/types";
import { AuthService } from "@/services/auth-service";
import { NodeService } from "@/services/node-service";
import { OrganizationService } from "@/services/organization-service";
import { ProjectService } from "@/services/project-service";
import { UserService } from "@/services/user-service";
import { NoopWorkspaceProvisioner } from "@/services/workspace-provisioner";
import { WorkspaceService } from "@/services/workspace-service";

export type AppServices = {
  user: UserService;
  auth: AuthService;
  organization: OrganizationService;
  node: NodeService;
  project: ProjectService;
  workspace: WorkspaceService;
};

export function createServices(deps: { db: AppDb; dbWs: AppDbWs; config: ServiceConfig }): AppServices {
  const user = new UserService(deps.db, deps.dbWs);
  const organization = new OrganizationService(deps.db, deps.dbWs);
  const workspaceProvisioner = new NoopWorkspaceProvisioner();

  return {
    user,
    auth: new AuthService(deps.db, deps.config, user),
    organization,
    node: new NodeService(deps.db, deps.dbWs, organization),
    project: new ProjectService(deps.db, deps.dbWs, organization),
    workspace: new WorkspaceService(deps.db, deps.dbWs, organization, workspaceProvisioner)
  };
}
