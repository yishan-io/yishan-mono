import type { OAuthProfile, OAuthProvider, ServiceConfig } from "@/types";
import { randomToken, sha256Base64Url } from "@/auth/security";

const GOOGLE_SCOPES = ["openid", "email", "profile"];
const GITHUB_SCOPES = ["read:user", "user:email"];

export type OAuthStart = {
  state: string;
  codeVerifier: string;
  authorizationUrl: string;
};

export async function buildAuthorizationUrl(
  provider: OAuthProvider,
  config: ServiceConfig
): Promise<OAuthStart> {
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  if (provider === "google") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.googleClientId,
      redirect_uri: buildCallbackUrl(config.appBaseUrl, provider),
      scope: GOOGLE_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent"
    });

    return {
      state,
      codeVerifier,
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    };
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.githubClientId,
    redirect_uri: buildCallbackUrl(config.appBaseUrl, provider),
    scope: GITHUB_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return {
    state,
    codeVerifier,
    authorizationUrl: `https://github.com/login/oauth/authorize?${params.toString()}`
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
  config: ServiceConfig
): Promise<OAuthProfile> {
  if (provider === "google") {
    const token = await exchangeGoogleToken(code, codeVerifier, config);
    return getGoogleProfile(token.access_token);
  }

  const token = await exchangeGithubToken(code, codeVerifier, config);
  return getGithubProfile(token.access_token);
}

async function exchangeGoogleToken(
  code: string,
  codeVerifier: string,
  config: ServiceConfig
): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      redirect_uri: buildCallbackUrl(config.appBaseUrl, "google"),
      code_verifier: codeVerifier
    })
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Google OAuth code");
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
      Authorization: `Bearer ${accessToken}`
    }
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
    avatarUrl: profile.picture ?? null
  };
}

async function exchangeGithubToken(
  code: string,
  codeVerifier: string,
  config: ServiceConfig
): Promise<TokenResponse> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: buildCallbackUrl(config.appBaseUrl, "github"),
      code_verifier: codeVerifier
    })
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
    "User-Agent": "yishan-api-service"
  };

  const userResponse = await fetch("https://api.github.com/user", {
    headers: baseHeaders
  });

  if (!userResponse.ok) {
    throw new Error("Failed to load GitHub profile");
  }

  const user = (await userResponse.json()) as GithubUserResponse;
  const emailResponse = await fetch("https://api.github.com/user/emails", {
    headers: baseHeaders
  });

  if (!emailResponse.ok) {
    throw new Error("Failed to load GitHub email addresses");
  }

  const emails = (await emailResponse.json()) as GithubEmailResponse[];
  const primaryVerified =
    emails.find((entry) => entry.primary && entry.verified) ??
    emails.find((entry) => entry.verified);

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
    avatarUrl: user.avatar_url
  };
}
