import { deleteSecureStoredValue, getSecureStoredValue, setSecureStoredValue } from "@/lib/storage/key-value-storage";

const SESSION_KEY = "yishan.mobile.session";

export type StoredSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: "Bearer";
};

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const s = value as Record<string, unknown>;
  return (
    typeof s.accessToken === "string" &&
    typeof s.accessTokenExpiresAt === "string" &&
    typeof s.refreshToken === "string" &&
    typeof s.refreshTokenExpiresAt === "string"
  );
}

export async function loadStoredSession(): Promise<StoredSession | null> {
  const raw = await getSecureStoredValue(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  await setSecureStoredValue(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  await deleteSecureStoredValue(SESSION_KEY);
}
