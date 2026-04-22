import type { AppDb } from "@/db/client";
import type { ServiceConfig } from "@/types";
import { AuthService } from "@/services/auth-service";
import { NodeService } from "@/services/node-service";
import { OrganizationService } from "@/services/organization-service";
import { ProjectService } from "@/services/project-service";
import { UserService } from "@/services/user-service";

export type AppServices = {
  user: UserService;
  auth: AuthService;
  organization: OrganizationService;
  node: NodeService;
  project: ProjectService;
};

export function createServices(deps: { db: AppDb; config: ServiceConfig }): AppServices {
  const user = new UserService(deps.db);
  const organization = new OrganizationService(deps.db);

  return {
    user,
    auth: new AuthService(deps.db, deps.config, user),
    organization,
    node: new NodeService(deps.db, organization),
    project: new ProjectService(deps.db, organization)
  };
}
