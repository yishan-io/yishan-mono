import type { Context } from "hono";

import type { SessionUser } from "./auth/session";
import type { OAuthProvider } from "./types";

export type AppEnv = {
  Variables: {
    oauthProvider: OAuthProvider;
    sessionUser: SessionUser;
  };
};

export type AppContext = Context<AppEnv>;
