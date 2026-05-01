import { contextBridge, ipcRenderer } from "electron";
import { DESKTOP_RPC_IPC_CHANNELS, type DesktopBridge, type DesktopRpcEventEnvelope, HOST_IPC_CHANNELS } from "./ipc";

/** Exposes immutable desktop bootstrap values for renderer transport initialization. */
const bridge: DesktopBridge = {
  host: {
    openLocalFolderDialog: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.openLocalFolderDialog, input),
    toggleMainWindowMaximized: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.toggleMainWindowMaximized),
    getMainWindowFullscreenState: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getMainWindowFullscreenState),
    openEntryInExternalApp: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.openEntryInExternalApp, input),
    openExternalUrl: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.openExternalUrl, input),
    readExternalClipboardSourcePaths: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.readExternalClipboardSourcePaths),
    dispatchNotification: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.dispatchNotification, input),
    playNotificationSound: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.playNotificationSound, input),
    getPendingUpdate: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getPendingUpdate),
    installUpdate: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.installUpdate),
    getAuthStatus: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getAuthStatus),
    login: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.login),
    getAuthTokens: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getAuthTokens),
    getDaemonInfo: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getDaemonInfo),
  },
  events: {
    subscribe: (listener: (envelope: DesktopRpcEventEnvelope) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, envelope: DesktopRpcEventEnvelope) => {
        listener(envelope);
      };
      ipcRenderer.on(DESKTOP_RPC_IPC_CHANNELS.event, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_RPC_IPC_CHANNELS.event, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
});
contextBridge.exposeInMainWorld("__YISHAN__", Object.freeze(bridge));
