import { contextBridge, ipcRenderer } from "electron";
import { type DesktopBridge, HOST_IPC_CHANNELS } from "./ipc";

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
    getAuthStatus: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getAuthStatus),
    login: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.login),
    getAuthTokens: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getAuthTokens),
    getDaemonInfo: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getDaemonInfo),
  },
};

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
});
contextBridge.exposeInMainWorld("__YISHAN__", Object.freeze(bridge));
