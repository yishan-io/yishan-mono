const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
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

async function hmacSha256(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const digest = await crypto.subtle.sign("HMAC", key, textEncoder.encode(input));
  return bytesToBase64Url(new Uint8Array(digest));
}

type SignedPayloadResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
};

export async function signPayload<T>(payload: T, secret: string): Promise<string> {
  const payloadString = JSON.stringify(payload);
  const payloadBytes = textEncoder.encode(payloadString);
  const encodedPayload = bytesToBase64Url(payloadBytes);
  const signature = await hmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyPayload<T>(raw: string, secret: string): Promise<SignedPayloadResult<T>> {
  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) {
    return { ok: false };
  }

  const expectedSignature = await hmacSha256(encodedPayload, secret);
  if (expectedSignature !== signature) {
    return { ok: false };
  }

  try {
    const payloadBytes = base64UrlToBytes(encodedPayload);
    const jsonString = new TextDecoder().decode(payloadBytes);
    return {
      ok: true,
      data: JSON.parse(jsonString) as T
    };
  } catch {
    return { ok: false };
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
