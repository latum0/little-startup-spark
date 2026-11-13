export interface LibraryGame {
  id: string;
  title: string;
  description: string;
  genre: string;
  releaseDate: string;
  developer: string;
  publisher: string;
  cover: string | null;
  executablePath: string | null;
  installPath: string | null;
  lastPlayedAt: string | null;
  createdAt: string;
}

export interface DownloadItem {
  id: string;
  title: string;
  url: string;
  destinationPath: string;
  totalBytes: number | null;
  receivedBytes: number;
  state: "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";
  error: string | null;
  createdAt: string;
}

export interface AppSettings {
  downloadDirectory: string;
  installDirectory: string;
}

export interface GameMetadataInput {
  title: string;
  description: string;
  genre: string;
  releaseDate: string;
  developer: string;
  publisher: string;
}

export interface ExternalMetadataInput extends GameMetadataInput {
  cover: string | null;
}

export interface DownloadProgress {
  downloadId: string;
  receivedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number;
  state: DownloadItem["state"];
}

export interface StorageInfo {
  totalBytes: number | null;
  freeBytes: number | null;
}

export interface MetadataRecord {
  id: number;
  title: string;
  genre: string;
  releaseDate: string;
  description: string;
  developer: string;
  publisher: string;
  thumbnail: string;
  gameUrl: string;
}

export interface FitGirlGameSummary {
  id: string;
  title: string;
  cover: string;
  href: string;
}

export interface FitGirlTorrent {
  label: string;
  url: string;
}

export interface FitGirlGameDetail {
  id: string;
  title: string;
  cover: string;
  description: string;
  genre: string;
  releaseYear: number | null;
  developer: string;
  publisher: string;
  sizeGB: string | null;
  torrents: FitGirlTorrent[];
  screenshots: string[];
  originalUrl: string;
}

export interface GameRecommendation {
  id: string;
  title: string;
  category: string;
  cover: string;
  href: string;
  price: string;
}

export interface TorrentStatus {
  infoHash: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  timeRemaining: number;
  downloaded: number;
  length: number;
  state: "downloading" | "seeding" | "paused" | "error";
  savePath: string;
}

export interface DesktopBridge {
  getAppVersion(): Promise<string>;
  getLibrary(): Promise<LibraryGame[]>;
  chooseAndAddGame(): Promise<LibraryGame | null>;
  chooseAndAddGameFromFolder(): Promise<LibraryGame | null>;
  chooseExecutableForGame(id: string): Promise<LibraryGame>;
  chooseCoverForGame(id: string): Promise<LibraryGame>;
  addMetadataGame(id: number): Promise<LibraryGame>;
  addExternalMetadata(input: ExternalMetadataInput): Promise<LibraryGame>;
  updateGame(id: string, details: GameMetadataInput): Promise<LibraryGame>;
  removeGame(id: string): Promise<void>;
  uninstallGame(id: string): Promise<void>;
  launchGame(id: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  getStorageInfo(): Promise<StorageInfo>;
  chooseDirectory(kind: "download" | "install"): Promise<string | null>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  getDownloads(): Promise<DownloadItem[]>;
  addDownload(url: string): Promise<DownloadItem | null>;
  cancelDownload(id: string): Promise<void>;
  resumeDownload(id: string): Promise<void>;
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
  getMetadataCatalog(): Promise<MetadataRecord[]>;
  getFitGirlCatalog(): Promise<FitGirlGameSummary[]>;
  getFitGirlGameDetail(slug: string): Promise<FitGirlGameDetail>;
  getGameRecommendations(): Promise<GameRecommendation[]>;
  openTorrent(url: string): Promise<void>;

  /* BitTorrent Methods */
  startTorrentDownload(url: string, savePath: string): Promise<string>;
  getTorrentStatuses(): Promise<TorrentStatus[]>;
  pauseTorrent(infoHash: string): Promise<void>;
  resumeTorrent(infoHash: string): Promise<void>;
  removeTorrent(infoHash: string): Promise<void>;
  onTorrentProgress(callback: (statuses: TorrentStatus[]) => void): () => void;
}
