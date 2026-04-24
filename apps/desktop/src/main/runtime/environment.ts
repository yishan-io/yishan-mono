export function isDevMode(): boolean {
  return process.env.ELECTRON_CHANNEL === "dev" || process.env.NODE_ENV === "development";
}
