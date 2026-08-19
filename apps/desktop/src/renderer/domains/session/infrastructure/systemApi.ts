import { requestJson } from "@renderer/api/restClient";

export type RemoteHealthResponse = {
  ok: boolean;
};

/** Fetches current remote API health status. */
export async function getRemoteHealthStatus(): Promise<RemoteHealthResponse> {
  return await requestJson<RemoteHealthResponse>("/health");
}
