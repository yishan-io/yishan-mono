import { sign, verify } from "hono/jwt";

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToBase64Url(data);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type AccessTokenClaims = {
  type: "access";
  sub: string;
  sid: string;
  scope: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

export async function signAccessToken(
  payload: Omit<AccessTokenClaims, "type">,
  secret: string
): Promise<string> {
  const claims: AccessTokenClaims = {
    type: "access",
    ...payload
  };

  return sign(claims, secret, "HS256");
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  expectedIssuer: string,
  expectedAudience: string
): Promise<AccessTokenClaims | null> {
  let payload: Record<string, unknown>;

  try {
    payload = (await verify(token, secret, "HS256")) as Record<string, unknown>;
  } catch {
    return null;
  }

  const claims = payload as Partial<AccessTokenClaims>;

  if (claims.type !== "access") {
    return null;
  }

  if (claims.iss !== expectedIssuer || claims.aud !== expectedAudience) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    return null;
  }

  if (
    typeof claims.sub !== "string" ||
    typeof claims.sid !== "string" ||
    typeof claims.scope !== "string" ||
    typeof claims.iat !== "number"
  ) {
    return null;
  }

  return claims as AccessTokenClaims;
}
