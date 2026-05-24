import { requestJson } from "./restClient";
import type { ServiceTokenRecord } from "./serviceTokenTypes";

export async function listServiceTokens(): Promise<ServiceTokenRecord[]> {
  const response = await requestJson<{ serviceTokens: ServiceTokenRecord[] }>("/service-tokens");
  return response.serviceTokens;
}

export async function createServiceToken(input: {
  name: string;
  expiresInDays?: number;
}): Promise<ServiceTokenRecord> {
  const response = await requestJson<{ serviceToken: ServiceTokenRecord }>("/service-tokens", {
    method: "POST",
    body: input,
  });
  return response.serviceToken;
}

export async function revokeServiceToken(tokenId: string): Promise<void> {
  await requestJson(`/service-tokens/${tokenId}`, { method: "DELETE" });
}
