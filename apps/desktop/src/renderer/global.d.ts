import type { DesktopBridge } from "@main/ipc";

declare global {
  interface Window {
    desktop?: {
      platform: NodeJS.Platform;
      /** Returns the absolute filesystem path for a File object from a drag-and-drop or input event. */
      getPathForFile: (file: File) => string;
    };
    __YISHAN__: DesktopBridge;
  }
}
