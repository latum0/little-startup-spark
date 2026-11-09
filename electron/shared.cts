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

export interface DesktopBridge {
  getAppVersion(): Promise<string>;
  getLibrary(): Promise<LibraryGame[]>;
  chooseAndAddGame(): Promise<LibraryGame | null>;
  chooseAndAddGameFromFolder(): Promise<LibraryGame | null>;
  chooseExecutableForGame(id: string): Promise<LibraryGame>;
  addMetadataGame(id: number): Promise<LibraryGame>;
  updateGame(id: string, details: GameMetadataInput): Promise<LibraryGame>;
  removeGame(id: string): Promise<void>;
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
