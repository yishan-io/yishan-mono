import { randomToken, sha256Base64Url } from "@/auth/security";
import type { OAuthProfile, OAuthProvider, ServiceConfig } from "@/types";

const GOOGLE_SCOPES = ["openid", "email", "profile"];
const GITHUB_SCOPES = ["read:user", "user:email"];
const OAUTH_FETCH_TIMEOUT_MS = 15_000;

export type OAuthStart = {
  state: string;
  codeVerifier: string;
  authorizationUrl: string;
};

export async function buildAuthorizationUrl(
  provider: OAuthProvider,
  config: ServiceConfig,
  callbackBaseUrl?: string,
): Promise<OAuthStart> {
  const baseUrl = callbackBaseUrl ?? config.appBaseUrl;
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  if (provider === "google") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.googleClientId,
      redirect_uri: buildCallbackUrl(baseUrl, provider),
      scope: GOOGLE_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    return {
      state,
      codeVerifier,
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.githubClientId,
    redirect_uri: buildCallbackUrl(baseUrl, provider),
    scope: GITHUB_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    state,
    codeVerifier,
    authorizationUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
  };
}

function buildCallbackUrl(baseUrl: string, provider: OAuthProvider): string {
  const callbackPath = `/auth/${provider}/callback`;
  return new URL(callbackPath, baseUrl).toString();
}

type TokenResponse = {
  access_token: string;
};

export async function exchangeCodeForProfile(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
  config: ServiceConfig,
  callbackBaseUrl?: string,
): Promise<OAuthProfile> {
  const redirectUri = buildCallbackUrl(callbackBaseUrl ?? config.appBaseUrl, provider);
  return exchangeCodeForProfileWithRedirectUri(provider, code, codeVerifier, config, redirectUri);
}

export async function exchangeCodeForProfileWithRedirectUri(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
  config: ServiceConfig,
  redirectUri: string,
  options?: {
    clientId?: string;
    clientSecret?: string | null;
  },
): Promise<OAuthProfile> {
  if (provider === "google") {
    const token = await exchangeGoogleToken(code, codeVerifier, config, redirectUri, options);
    return getGoogleProfile(token.access_token);
  }

  const token = await exchangeGithubToken(code, codeVerifier, config, redirectUri);
  return getGithubProfile(token.access_token);
}

async function exchangeGoogleToken(
  code: string,
  codeVerifier: string,
  config: ServiceConfig,
  redirectUri: string,
  options?: {
    clientId?: string;
    clientSecret?: string | null;
  },
): Promise<TokenResponse> {
  const clientId = options?.clientId ?? config.googleClientId;
  const clientSecret =
    options && Object.prototype.hasOwnProperty.call(options, "clientSecret")
      ? options.clientSecret
      : config.googleClientSecret;
  const requestBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  if (clientSecret) {
    requestBody.set("client_secret", clientSecret);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody,
    signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      // ignore response parse failures
    }

    throw new Error(
      `Failed to exchange Google OAuth code (status=${response.status}${details ? `, body=${details}` : ""})`,
    );
  }

  return (await response.json()) as TokenResponse;
}

type GoogleProfileResponse = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

async function getGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error("Failed to load Google profile");
  }

  const profile = (await response.json()) as GoogleProfileResponse;

  if (!profile.email) {
    throw new Error("Google account does not provide an email address");
  }

  if (!profile.email_verified) {
    throw new Error("Google account email is not verified");
  }

  return {
    provider: "google",
    providerUserId: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: true,
    name: profile.name ?? null,
    avatarUrl: profile.picture ?? null,
  };
}

async function exchangeGithubToken(
  code: string,
  codeVerifier: string,
  config: ServiceConfig,
  redirectUri: string,
): Promise<TokenResponse> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange GitHub OAuth code");
  }

  return (await response.json()) as TokenResponse;
}

type GithubUserResponse = {
  id: number;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type GithubEmailResponse = {
  email: string;
  verified: boolean;
  primary: boolean;
};

async function getGithubProfile(accessToken: string): Promise<OAuthProfile> {
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "yishan-api-service",
  };

  // Both GitHub API calls are independent — fetch them concurrently.
  const [userResponse, emailResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers: baseHeaders }),
    fetch("https://api.github.com/user/emails", { headers: baseHeaders }),
  ]);

  if (!userResponse.ok) {
    throw new Error("Failed to load GitHub profile");
  }

  if (!emailResponse.ok) {
    throw new Error("Failed to load GitHub email addresses");
  }

  const user = (await userResponse.json()) as GithubUserResponse;
  const emails = (await emailResponse.json()) as GithubEmailResponse[];
  const primaryVerified =
    emails.find((entry) => entry.primary && entry.verified) ?? emails.find((entry) => entry.verified);

  const email = primaryVerified?.email ?? null;

  if (!email) {
    throw new Error("GitHub account does not provide a verified email address");
  }

  return {
    provider: "github",
    providerUserId: String(user.id),
    email: email.toLowerCase(),
    emailVerified: true,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
}
