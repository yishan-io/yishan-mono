export type OAuthProvider = "google" | "github";

export type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type ServiceConfig = {
  databaseUrl: string;
  appBaseUrl: string;
  sessionSecret: string;
  sessionTtlDays: number;
  cookieDomain?: string;
  googleClientId: string;
  googleClientSecret: string;
  githubClientId: string;
  githubClientSecret: string;
};
