import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, TorrentStatus } from "./shared.cjs";

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
  chooseCoverForGame: (id) =>
    ipcRenderer.invoke("library:choose-cover", id) as Promise<
      Awaited<ReturnType<DesktopBridge["chooseCoverForGame"]>>
    >,
  findGameBackground: (id) =>
    ipcRenderer.invoke("library:find-background", id) as Promise<
      Awaited<ReturnType<DesktopBridge["findGameBackground"]>>
    >,
  addMetadataGame: (id) =>
    ipcRenderer.invoke("library:add-metadata", id) as Promise<
      Awaited<ReturnType<DesktopBridge["addMetadataGame"]>>
    >,
  addExternalMetadata: (input) =>
    ipcRenderer.invoke("library:add-external-metadata", input) as Promise<
      Awaited<ReturnType<DesktopBridge["addExternalMetadata"]>>
    >,
  updateGame: (id, details) =>
    ipcRenderer.invoke("library:update", { id, details }) as Promise<
      Awaited<ReturnType<DesktopBridge["updateGame"]>>
    >,
  removeGame: (id) => ipcRenderer.invoke("library:remove", id) as Promise<void>,
  uninstallGame: (id) => ipcRenderer.invoke("library:uninstall", id) as Promise<void>,
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
  getFitGirlCatalog: () =>
    ipcRenderer.invoke("fitgirl:catalog") as Promise<
      Awaited<ReturnType<DesktopBridge["getFitGirlCatalog"]>>
    >,
  getFitGirlGameDetail: (slug) =>
    ipcRenderer.invoke("fitgirl:detail", slug) as Promise<
      Awaited<ReturnType<DesktopBridge["getFitGirlGameDetail"]>>
    >,
  getGameRecommendations: () =>
    ipcRenderer.invoke("recommendations:catalog") as Promise<
      Awaited<ReturnType<DesktopBridge["getGameRecommendations"]>>
    >,
  openTorrent: (url) => ipcRenderer.invoke("torrents:open", url) as Promise<void>,

  /* BitTorrent Methods */
  startTorrentDownload: (url, savePath) =>
    ipcRenderer.invoke("torrents:add", { url, savePath }) as Promise<string>,
  getTorrentStatuses: () => ipcRenderer.invoke("torrents:list") as Promise<TorrentStatus[]>,
  pauseTorrent: (infoHash) => ipcRenderer.invoke("torrents:pause", infoHash) as Promise<void>,
  resumeTorrent: (infoHash) => ipcRenderer.invoke("torrents:resume", infoHash) as Promise<void>,
  removeTorrent: (infoHash) => ipcRenderer.invoke("torrents:remove", infoHash) as Promise<void>,
  onTorrentProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, statuses: TorrentStatus[]) =>
      callback(statuses);
    ipcRenderer.on("torrents:progress", listener);
    return () => ipcRenderer.removeListener("torrents:progress", listener);
  },
};

contextBridge.exposeInMainWorld("nexus", bridge);
