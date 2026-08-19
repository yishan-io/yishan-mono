export type ServiceTokenRecord = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string;
  token?: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
