import { registerAppIpc } from "../ipc/registerAppIpc";
import { registerAuthIpc } from "../ipc/registerAuthIpc";
import { registerBrowserIpc } from "../ipc/registerBrowserIpc";
import { registerClipboardIpc } from "../ipc/registerClipboardIpc";
import { registerDaemonIpc } from "../ipc/registerDaemonIpc";
import { registerExternalAppIpc } from "../ipc/registerExternalAppIpc";
import { registerFileSystemIpc } from "../ipc/registerFileSystemIpc";
import { registerNotificationIpc } from "../ipc/registerNotificationIpc";
import { registerUpdateIpc } from "../ipc/registerUpdateIpc";
import { registerWindowIpc } from "../ipc/registerWindowIpc";

/** Operations supplied to the ten transport-only desktop capability registrars. */
export type DesktopHostIpcDependencies = {
  app: Parameters<typeof registerAppIpc>[0];
  auth: Parameters<typeof registerAuthIpc>[0];
  daemon: Parameters<typeof registerDaemonIpc>[0];
  window: Parameters<typeof registerWindowIpc>[0];
  updates: Parameters<typeof registerUpdateIpc>[0];
  browser: Parameters<typeof registerBrowserIpc>[0];
  notifications: Parameters<typeof registerNotificationIpc>[0];
  fileSystem: Parameters<typeof registerFileSystemIpc>[0];
  externalApp: Parameters<typeof registerExternalAppIpc>[0];
  clipboard: Parameters<typeof registerClipboardIpc>[0];
};

/** Composes exactly the ten desktop host capability registrars. */
export function registerDesktopHostIpc(dependencies: DesktopHostIpcDependencies): void {
  registerAppIpc(dependencies.app);
  registerAuthIpc(dependencies.auth);
  registerDaemonIpc(dependencies.daemon);
  registerWindowIpc(dependencies.window);
  registerUpdateIpc(dependencies.updates);
  registerBrowserIpc(dependencies.browser);
  registerNotificationIpc(dependencies.notifications);
  registerFileSystemIpc(dependencies.fileSystem);
  registerExternalAppIpc(dependencies.externalApp);
  registerClipboardIpc(dependencies.clipboard);
}
