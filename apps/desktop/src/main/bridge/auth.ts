export type AuthStatusResult = {
  authenticated: boolean;
  expiresAt?: string;
  error?: string;
};

export type AuthLoginResult = {
  authenticated: boolean;
  skipped: boolean;
  error?: string;
};
