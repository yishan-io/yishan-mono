/**
 * @deprecated DB query functions moved into `AuthService`.
 * This file is kept only to re-export the `TokenPair` type for backward compat.
 */
export type TokenPair = {
  accessToken: string;
  accessTokenExpiresIn: number;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};
