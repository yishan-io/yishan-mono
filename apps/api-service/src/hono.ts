import type { Context } from "hono";

import type { OrganizationMemberRole } from "@/db/schema";
import type { AppServices } from "@/services";
import type { SessionUser } from "@/services/auth-service";
import type { OAuthProvider, ServiceConfig } from "@/types";

type HyperdriveBinding = {
  connectionString: string;
};

export type AppEnv = {
  Bindings: {
    HYPERDRIVE?: HyperdriveBinding;
  };
  Variables: {
    config: ServiceConfig;
    services: AppServices;
    oauthProvider: OAuthProvider;
    sessionUser: SessionUser;
    organizationId: string;
    organizationRole: OrganizationMemberRole;
  };
};

export type AppContext = Context<AppEnv>;
