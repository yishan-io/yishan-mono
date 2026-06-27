import { contextBridge, ipcRenderer, webUtils } from "electron";
import { DESKTOP_RPC_IPC_CHANNELS, type DesktopBridge, type DesktopRpcEventEnvelope, HOST_IPC_CHANNELS } from "./ipc";

/** Exposes immutable desktop bootstrap values for renderer transport initialization. */
const bridge: DesktopBridge = {
  host: {
    getDesktopAppVersion: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getDesktopAppVersion),
    openLocalFolderDialog: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.openLocalFolderDialog, input),
    toggleMainWindowMaximized: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.toggleMainWindowMaximized),
    getMainWindowFullscreenState: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getMainWindowFullscreenState),
    openEntryInExternalApp: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.openEntryInExternalApp, input),
    openExternalUrl: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.openExternalUrl, input),
    readExternalClipboardSourcePaths: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.readExternalClipboardSourcePaths),
    resolveRealPath: (path: string) => ipcRenderer.invoke(HOST_IPC_CHANNELS.resolveRealPath, path),
    copyFiles: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.copyFiles, input),
    writeFileBase64: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.writeFileBase64, input),
    loadBrowserHistory: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.loadBrowserHistory),
    appendBrowserHistory: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.appendBrowserHistory, input),
    dispatchNotification: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.dispatchNotification, input),
    playNotificationSound: (input) => ipcRenderer.invoke(HOST_IPC_CHANNELS.playNotificationSound, input),
    requestMicrophoneAccess: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.requestMicrophoneAccess),
    getPendingUpdate: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getPendingUpdate),
    checkForUpdates: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.checkForUpdates),
    downloadUpdate: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.downloadUpdate),
    installUpdate: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.installUpdate),
    getAuthStatus: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getAuthStatus),
    login: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.login),
    getDaemonInfo: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getDaemonInfo),
    restartDaemon: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.restartDaemon),
    readDaemonLog: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.readDaemonLog),
    getDaemonQuitOnExit: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getDaemonQuitOnExit),
    setDaemonQuitOnExit: (value) => ipcRenderer.invoke(HOST_IPC_CHANNELS.setDaemonQuitOnExit, value),
    getDesktopCliInstallStatus: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.getDesktopCliInstallStatus),
    installDesktopCli: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.installDesktopCli),
    uninstallDesktopCli: () => ipcRenderer.invoke(HOST_IPC_CHANNELS.uninstallDesktopCli),
    writeClipboardText: (text: string) => ipcRenderer.invoke(HOST_IPC_CHANNELS.writeClipboardText, text),
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
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
contextBridge.exposeInMainWorld("__YISHAN__", Object.freeze(bridge));
