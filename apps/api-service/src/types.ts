export type OAuthProvider = "google" | "github";

export type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
};

export type ServiceConfig = {
  databaseUrl: string;
  appBaseUrl: string;
  landingBaseUrl: string;
  relayUrl?: string;
  relayApiToken?: string;
  sessionSecret: string;
  sessionTtlDays: number;
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  jwtIssuer: string;
  jwtAudience: string;
  cookieDomain?: string;
  googleClientId: string;
  googleClientSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  resendApiKey: string;
  resendFromEmail: string;
};
