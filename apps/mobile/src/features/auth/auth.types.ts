export type AuthTokenRecord = {
  tokenType: "Bearer";
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export type MobileOAuthExchangeInput = {
  provider: "google";
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
};
