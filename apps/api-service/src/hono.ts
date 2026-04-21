import type { Context } from "hono";

import type { SessionUser } from "./auth/session";
import type { AppServices } from "./services";
import type { ServiceConfig } from "./types";
import type { OAuthProvider } from "./types";

export type AppEnv = {
  Variables: {
    config: ServiceConfig;
    services: AppServices;
    oauthProvider: OAuthProvider;
    sessionUser: SessionUser;
  };
};

export type AppContext = Context<AppEnv>;
