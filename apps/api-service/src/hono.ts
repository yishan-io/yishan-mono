import type { Context } from "hono";

import type { SessionUser } from "@/auth/session";
import type { AppServices } from "@/services";
import type { OAuthProvider, ServiceConfig } from "@/types";

export type AppEnv = {
  Variables: {
    config: ServiceConfig;
    services: AppServices;
    oauthProvider: OAuthProvider;
    sessionUser: SessionUser;
    organizationId: string;
    organizationRole: "owner" | "admin" | "member";
  };
};

export type AppContext = Context<AppEnv>;
