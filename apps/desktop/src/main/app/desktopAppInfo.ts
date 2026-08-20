import { app } from "electron";
/** Returns the packaged desktop application version. */
export function getDesktopAppVersion(): string {
  return app.getVersion();
}
