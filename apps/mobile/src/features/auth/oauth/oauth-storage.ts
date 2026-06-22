import { deleteSecureStoredValue, getSecureStoredValue, setSecureStoredValue } from "@/lib/storage/key-value-storage";

const PENDING_GOOGLE_OAUTH_KEY = "yishan.mobile.oauth.google.pending";

export type PendingGoogleOAuthSession = {
  clientId: string;
  codeVerifier: string;
  createdAt: number;
  provider: "google";
  redirectUri: string;
  state: string;
};

function isPendingGoogleOAuthSession(value: unknown): value is PendingGoogleOAuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.provider === "google" &&
    typeof candidate.clientId === "string" &&
    typeof candidate.codeVerifier === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.redirectUri === "string" &&
    typeof candidate.state === "string"
  );
}

export async function loadPendingGoogleOAuthSession(): Promise<PendingGoogleOAuthSession | null> {
  const raw = await getSecureStoredValue(PENDING_GOOGLE_OAUTH_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isPendingGoogleOAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function savePendingGoogleOAuthSession(session: PendingGoogleOAuthSession): Promise<void> {
  await setSecureStoredValue(PENDING_GOOGLE_OAUTH_KEY, JSON.stringify(session));
}

export async function clearPendingGoogleOAuthSession(): Promise<void> {
  await deleteSecureStoredValue(PENDING_GOOGLE_OAUTH_KEY);
}
