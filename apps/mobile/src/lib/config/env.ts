/**
 * Infrastructure-owned environment access for mobile runtime config.
 * Features should consume derived helpers from here rather than reading `process.env` directly.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getApiBaseUrl(): string {
  return required("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL);
}
