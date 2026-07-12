import type { StoredSession } from "@/lib/storage/session-storage";
import type { AuthTokenRecord } from "./auth.types";

export function toStoredSession(record: AuthTokenRecord): StoredSession {
  return {
    ...record,
    tokenType: "Bearer",
  };
}
