import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "./shared.cjs";

const bridge: DesktopBridge = {
  getAppVersion: () => ipcRenderer.invoke("app:version") as Promise<string>,
  getLibrary: () =>
    ipcRenderer.invoke("library:list") as Promise<Awaited<ReturnType<DesktopBridge["getLibrary"]>>>,
  chooseAndAddGame: () =>
    ipcRenderer.invoke("library:add-from-dialog") as Promise<
      Awaited<ReturnType<DesktopBridge["chooseAndAddGame"]>>
    >,
  chooseAndAddGameFromFolder: () =>
    ipcRenderer.invoke("library:add-from-folder") as Promise<
      Awaited<ReturnType<DesktopBridge["chooseAndAddGameFromFolder"]>>
    >,
  chooseExecutableForGame: (id) =>
    ipcRenderer.invoke("library:set-executable", id) as Promise<
      Awaited<ReturnType<DesktopBridge["chooseExecutableForGame"]>>
    >,
  addMetadataGame: (id) =>
    ipcRenderer.invoke("library:add-metadata", id) as Promise<
      Awaited<ReturnType<DesktopBridge["addMetadataGame"]>>
    >,
  updateGame: (id, details) =>
    ipcRenderer.invoke("library:update", { id, details }) as Promise<
      Awaited<ReturnType<DesktopBridge["updateGame"]>>
    >,
  removeGame: (id) => ipcRenderer.invoke("library:remove", id) as Promise<void>,
  launchGame: (id) => ipcRenderer.invoke("library:launch", id) as Promise<void>,
  getSettings: () =>
    ipcRenderer.invoke("settings:get") as Promise<
      Awaited<ReturnType<DesktopBridge["getSettings"]>>
    >,
  getStorageInfo: () =>
    ipcRenderer.invoke("settings:storage") as Promise<
      Awaited<ReturnType<DesktopBridge["getStorageInfo"]>>
    >,
  chooseDirectory: (kind) =>
    ipcRenderer.invoke("settings:choose-directory", kind) as Promise<string | null>,
  saveSettings: (settings) =>
    ipcRenderer.invoke("settings:save", settings) as Promise<
      Awaited<ReturnType<DesktopBridge["saveSettings"]>>
    >,
  getDownloads: () =>
    ipcRenderer.invoke("downloads:list") as Promise<
      Awaited<ReturnType<DesktopBridge["getDownloads"]>>
    >,
  addDownload: (url) =>
    ipcRenderer.invoke("downloads:add", url) as Promise<
      Awaited<ReturnType<DesktopBridge["addDownload"]>>
    >,
  cancelDownload: (id) => ipcRenderer.invoke("downloads:cancel", id) as Promise<void>,
  resumeDownload: (id) => ipcRenderer.invoke("downloads:resume", id) as Promise<void>,
  onDownloadProgress: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: Parameters<typeof callback>[0],
    ) => callback(progress);
    ipcRenderer.on("downloads:progress", listener);
    return () => ipcRenderer.removeListener("downloads:progress", listener);
  },
  getMetadataCatalog: () =>
    ipcRenderer.invoke("metadata:catalog") as Promise<
      Awaited<ReturnType<DesktopBridge["getMetadataCatalog"]>>
    >,
};

contextBridge.exposeInMainWorld("nexus", bridge);
