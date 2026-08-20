import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopEventEnvelope } from "../shared/contracts/desktopEventEnvelope";
import { desktopHostChannels, desktopHostEventChannels } from "./bridge/channels";
import type { DesktopBridge } from "./bridge/desktopBridge";

/** Exposes immutable desktop bootstrap values for renderer transport initialization. */
const bridge: DesktopBridge = {
  host: {
    getDesktopAppVersion: () => ipcRenderer.invoke(desktopHostChannels.getDesktopAppVersion),
    openLocalFolderDialog: (input) => ipcRenderer.invoke(desktopHostChannels.openLocalFolderDialog, input),
    toggleMainWindowMaximized: () => ipcRenderer.invoke(desktopHostChannels.toggleMainWindowMaximized),
    getMainWindowFullscreenState: () => ipcRenderer.invoke(desktopHostChannels.getMainWindowFullscreenState),
    openEntryInExternalApp: (input) => ipcRenderer.invoke(desktopHostChannels.openEntryInExternalApp, input),
    listDetectedExternalAppIds: () => ipcRenderer.invoke(desktopHostChannels.listDetectedExternalAppIds),
    openExternalUrl: (input) => ipcRenderer.invoke(desktopHostChannels.openExternalUrl, input),
    readExternalClipboardSourcePaths: () => ipcRenderer.invoke(desktopHostChannels.readExternalClipboardSourcePaths),
    resolveRealPath: (path: string) => ipcRenderer.invoke(desktopHostChannels.resolveRealPath, path),
    copyFiles: (input) => ipcRenderer.invoke(desktopHostChannels.copyFiles, input),
    writeFileBase64: (input) => ipcRenderer.invoke(desktopHostChannels.writeFileBase64, input),
    loadBrowserHistory: () => ipcRenderer.invoke(desktopHostChannels.loadBrowserHistory),
    appendBrowserHistory: (input) => ipcRenderer.invoke(desktopHostChannels.appendBrowserHistory, input),
    dispatchNotification: (input) => ipcRenderer.invoke(desktopHostChannels.dispatchNotification, input),
    playNotificationSound: (input) => ipcRenderer.invoke(desktopHostChannels.playNotificationSound, input),
    requestMicrophoneAccess: () => ipcRenderer.invoke(desktopHostChannels.requestMicrophoneAccess),
    getPendingUpdate: () => ipcRenderer.invoke(desktopHostChannels.getPendingUpdate),
    dismissUpdate: () => ipcRenderer.invoke(desktopHostChannels.dismissUpdate),
    checkForUpdates: () => ipcRenderer.invoke(desktopHostChannels.checkForUpdates),
    downloadUpdate: () => ipcRenderer.invoke(desktopHostChannels.downloadUpdate),
    installUpdate: () => ipcRenderer.invoke(desktopHostChannels.installUpdate),
    getAuthStatus: () => ipcRenderer.invoke(desktopHostChannels.getAuthStatus),
    login: () => ipcRenderer.invoke(desktopHostChannels.login),
    getDaemonInfo: () => ipcRenderer.invoke(desktopHostChannels.getDaemonInfo),
    restartDaemon: () => ipcRenderer.invoke(desktopHostChannels.restartDaemon),
    readDaemonLog: () => ipcRenderer.invoke(desktopHostChannels.readDaemonLog),
    getDaemonQuitOnExit: () => ipcRenderer.invoke(desktopHostChannels.getDaemonQuitOnExit),
    setDaemonQuitOnExit: (value) => ipcRenderer.invoke(desktopHostChannels.setDaemonQuitOnExit, value),
    writeClipboardText: (text: string) => ipcRenderer.invoke(desktopHostChannels.writeClipboardText, text),
  },
  events: {
    subscribe: (listener: (envelope: DesktopEventEnvelope) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, envelope: DesktopEventEnvelope) => {
        listener(envelope);
      };
      ipcRenderer.on(desktopHostEventChannels.event, handler);
      return () => {
        ipcRenderer.removeListener(desktopHostEventChannels.event, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
contextBridge.exposeInMainWorld("__YISHAN__", Object.freeze(bridge));
