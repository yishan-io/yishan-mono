import * as ExpoCrypto from "expo-crypto";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

export const GOOGLE_OAUTH_CALLBACK_PATH = "oauth/google/callback";
const APP_SCHEME = "yishan";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    output += alphabet[(chunk >> 18) & 63] ?? "";
    output += alphabet[(chunk >> 12) & 63] ?? "";
    output += index + 1 < bytes.length ? (alphabet[(chunk >> 6) & 63] ?? "") : "=";
    output += index + 2 < bytes.length ? (alphabet[chunk & 63] ?? "") : "=";
  }

  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBytes(length: number): Uint8Array {
  return ExpoCrypto.getRandomBytes(length);
}

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizePath(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function parseLinkTarget(uri: string): { hostname: string; path: string; scheme: string } {
  const parsed = Linking.parse(uri);
  return {
    hostname: parsed.hostname?.trim().toLowerCase() ?? "",
    path: normalizePath(parsed.path),
    scheme: parsed.scheme?.trim().toLowerCase() ?? "",
  };
}

function isSameLinkTarget(left: string, right: string): boolean {
  const a = parseLinkTarget(left);
  const b = parseLinkTarget(right);
  return a.scheme === b.scheme && a.hostname === b.hostname && a.path === b.path;
}

function getPlatformValue(input: {
  android?: string;
  fallback?: string;
  ios?: string;
}): string {
  if (Platform.OS === "ios") {
    return input.ios?.trim() || input.fallback?.trim() || "";
  }

  if (Platform.OS === "android") {
    return input.android?.trim() || input.fallback?.trim() || "";
  }

  return input.fallback?.trim() || "";
}

function normalizeScheme(value: string | undefined): string {
  return value?.trim().replace(/:\/?\/?$/, "") ?? "";
}

function buildRedirectUriFromScheme(scheme: string): string {
  return `${scheme}:/${GOOGLE_OAUTH_CALLBACK_PATH}`;
}

function buildAppCallbackUrl(): string {
  return Linking.createURL(GOOGLE_OAUTH_CALLBACK_PATH, { scheme: APP_SCHEME });
}

export function supportsGoogleOAuthBrowserFlow(): boolean {
  return Platform.OS === "ios";
}

export function getGoogleOAuthClientId(): string {
  if (Platform.OS === "ios") {
    return required("EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS", process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS?.trim());
  }

  if (Platform.OS === "android") {
    return required("EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID", process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID?.trim());
  }

  throw new Error(`Unsupported platform for Google OAuth client: ${Platform.OS}`);
}

export function getGoogleOAuthScheme(): string {
  if (Platform.OS === "android") {
    return "";
  }

  const configuredScheme = getPlatformValue({
    fallback: normalizeScheme(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_SCHEME),
    ios: normalizeScheme(
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_SCHEME || process.env.EXPO_PUBLIC_GOOGLE_OAUTH_SCHEME_IOS,
    ),
  });

  if (configuredScheme) {
    return configuredScheme;
  }

  const configuredRedirectUri = getPlatformValue({
    android: trimEnv(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI_ANDROID),
    fallback: trimEnv(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI),
    ios: trimEnv(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI_IOS),
  });

  if (configuredRedirectUri) {
    return parseLinkTarget(configuredRedirectUri).scheme;
  }

  return APP_SCHEME;
}

export function getGoogleOAuthRedirectUri(): string {
  if (!supportsGoogleOAuthBrowserFlow()) {
    throw new Error("Android Google sign-in must use a native Credential Manager flow and is not wired yet.");
  }

  const configuredScheme = getGoogleOAuthScheme();
  if (configuredScheme) {
    return buildRedirectUriFromScheme(configuredScheme);
  }

  return buildAppCallbackUrl();
}

export function isGoogleOAuthRedirectUrl(url: string): boolean {
  const configuredRedirectUri = getGoogleOAuthRedirectUri();
  const candidates = [configuredRedirectUri, buildAppCallbackUrl()];

  return candidates.some((candidate) => isSameLinkTarget(url, candidate));
}

export function isGoogleOAuthCallbackPath(pathname: string, hostname: string): boolean {
  const normalizedPath = normalizePath(pathname);
  void hostname;
  return normalizedPath === GOOGLE_OAUTH_CALLBACK_PATH;
}

export function createOAuthState(): string {
  return base64UrlEncode(randomBytes(24));
}

export function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(48));
}

export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await ExpoCrypto.digestStringAsync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: ExpoCrypto.CryptoEncoding.BASE64,
  });
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    access_type: "offline",
    client_id: input.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent",
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: ["openid", "email", "profile"].join(" "),
    state: input.state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
