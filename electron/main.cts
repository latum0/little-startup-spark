import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from "electron";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import initSqlJs from "sql.js";
import type WebTorrent from "webtorrent";
import { NexusDatabase } from "./database.cjs";
import { FitGirlCatalog } from "./fitgirl.cjs";
import type {
  AppSettings,
  DownloadItem,
  DownloadProgress,
  LibraryGame,
  MetadataRecord,
  TorrentStatus,
} from "./shared.cjs";

const appScheme = "nexus";
const appOrigin = `${appScheme}://app`;
const devServerUrl = process.env.NEXUS_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
let database: NexusDatabase;
let torrentClient: WebTorrent;
let recommendationCache: {
  games: {
    id: string;
    title: string;
    category: string;
    cover: string;
    href: string;
    price: string;
  }[];
  fetchedAt: number;
} | null = null;
const activeDownloads = new Map<string, AbortController>();
const selectedDirectories = new Set<string>();
const fitGirlCatalog = new FitGirlCatalog();

protocol.registerSchemesAsPrivileged([
  { scheme: appScheme, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function isTrustedFrame(url: string): boolean {
  return url.startsWith(`${appOrigin}/`) || url.startsWith(`${devServerUrl}/`);
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedFrame(event.senderFrame?.url ?? "")) throw new Error("Untrusted IPC sender");
}

function registerHandler<T>(
  channel: string,
  schema: z.ZodType<T>,
  handler: (data: T, event: IpcMainInvokeEvent) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedSender(event);
    const parsed = schema.safeParse(args[0]);
    if (!parsed.success) throw new Error(`Invalid request for ${channel}`);
    return handler(parsed.data, event);
  });
}

const noInput = z.undefined();
const gameIdInput = z.string().uuid();
const directoryKindInput = z.enum(["download", "install"]);
const settingsInput = z.object({
  downloadDirectory: z.string().min(1).max(2048),
  installDirectory: z.string().min(1).max(2048),
});
const gameUpdateInput = z.object({
  id: z.string().uuid(),
  details: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(5000),
    genre: z.string().max(120),
    releaseDate: z.string().max(80),
    developer: z.string().max(200),
    publisher: z.string().max(200),
  }),
});
const metadataIdInput = z.number().int().positive();
const downloadUrlInput = z.string().url().max(4096);
const externalMetadataInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  genre: z.string().max(120),
  releaseDate: z.string().max(80),
  developer: z.string().max(200),
  publisher: z.string().max(200),
  cover: z.string().url().max(2048).nullable(),
});
const torrentUrlInput = z
  .string()
  .min(1)
  .max(16384)
  .refine(
    (value) =>
      value.startsWith("magnet:") || value.startsWith("http://") || value.startsWith("https://"),
    { message: "Unsupported torrent URL" },
  );
const torrentAddInput = z.object({
  url: torrentUrlInput,
  savePath: z.string().min(1).max(2048),
});

function defaultSettings(): AppSettings {
  const root = join(app.getPath("home"), "Games", "NEXUS");
  return { downloadDirectory: join(app.getPath("downloads"), "NEXUS"), installDirectory: root };
}

function safeGameFolderName(title: string): string {
  const safe = title
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim()
    .replace(/[. ]+$/g, "");
  return safe && safe !== "." && safe !== ".." ? safe : "Game";
}

async function containsSetupExecutable(folder: string, depth = 0): Promise<boolean> {
  if (depth > 2) return false;
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === "setup.exe") return true;
    if (entry.isDirectory() && (await containsSetupExecutable(join(folder, entry.name), depth + 1)))
      return true;
  }
  return false;
}

async function initializeDatabase(): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  const SQL = await initSqlJs();
  database = new NexusDatabase(join(app.getPath("userData"), "nexus.sqlite"), SQL);
  const settings = database.getSettings(defaultSettings());
  await Promise.all([
    mkdir(settings.downloadDirectory, { recursive: true }),
    mkdir(settings.installDirectory, { recursive: true }),
  ]);
  database.saveSettings(settings);
}

function libraryGameFromSelection(
  executablePath: string,
  installPath = dirname(executablePath),
): LibraryGame {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: basename(executablePath, extname(executablePath)),
    description: "",
    genre: "",
    releaseDate: "",
    developer: "",
    publisher: "",
    cover: null,
    executablePath,
    installPath,
    lastPlayedAt: null,
    createdAt: now,
  };
}

async function selectExecutable(
  parent: BrowserWindow | null,
  defaultPath?: string,
): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: "Select game executable",
    properties: ["openFile"],
    filters: [{ name: "Windows applications", extensions: ["exe"] }],
    ...(defaultPath ? { defaultPath } : {}),
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const executable = result.filePaths[0];
  if (
    !executable ||
    extname(executable).toLowerCase() !== ".exe" ||
    !(await stat(executable)).isFile()
  ) {
    throw new Error("Select a valid Windows executable.");
  }
  return executable;
}

function getMainWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function broadcastDownloadProgress(progress: DownloadProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("downloads:progress", progress);
  }
}

async function getMetadataCatalog(): Promise<MetadataRecord[]> {
  const cached = database.getMetadataCache("freetogame:all");
  if (cached) return cached;
  const response = await fetch("https://www.freetogame.com/api/games?platform=all");
  if (!response.ok) throw new Error(`FreeToGame returned HTTP ${response.status}`);
  const records = z
    .array(
      z.object({
        id: z.number(),
        title: z.string(),
        genre: z.string().default(""),
        release_date: z.string().default(""),
        short_description: z.string().default(""),
        developer: z.string().default(""),
        publisher: z.string().default(""),
        thumbnail: z.string().url(),
        game_url: z.string().url(),
      }),
    )
    .parse(await response.json());
  const games: MetadataRecord[] = records.map((record) => ({
    id: record.id,
    title: record.title,
    genre: record.genre,
    releaseDate: record.release_date,
    description: record.short_description,
    developer: record.developer,
    publisher: record.publisher,
    thumbnail: record.thumbnail,
    gameUrl: record.game_url,
  }));
  database.saveMetadataCache("freetogame:all", games);
  return games;
}

async function cacheArtwork(record: MetadataRecord): Promise<string> {
  const url = new URL(record.thumbnail);
  if (url.protocol !== "https:") return record.thumbnail;
  const suffix = extname(url.pathname).toLowerCase();
  const extension = [".jpg", ".jpeg", ".png", ".webp"].includes(suffix) ? suffix : ".jpg";
  const directory = join(app.getPath("userData"), "covers");
  const filename = `${record.id}${extension}`;
  const localPath = join(directory, filename);
  if (!existsSync(localPath)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const contentType = response.headers.get("content-type") ?? "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !contentType.startsWith("image/") || bytes.byteLength > 15 * 1024 * 1024)
      return record.thumbnail;
    await mkdir(directory, { recursive: true });
    await writeFile(localPath, bytes);
  }
  return `${appOrigin}/covers/${filename}`;
}

async function cacheRemoteArtwork(rawUrl: string, key: string): Promise<string | null> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.byteLength > 15 * 1024 * 1024) return null;
    const extension = contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : ".jpg";
    const directory = join(app.getPath("userData"), "covers");
    const filename = `${key.replace(/[^a-z0-9-]/gi, "-")}${extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), bytes);
    return `${appOrigin}/covers/${filename}`;
  } catch {
    return null;
  }
}

function validateHttpUrl(value: string): string {
  const url = new URL(value);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("Only direct HTTP and HTTPS download links are supported.");
  }
  return url.toString();
}

async function startDownload(id: string): Promise<void> {
  const item = database.getDownload(id);
  if (!item || activeDownloads.has(id)) return;
  const controller = new AbortController();
  activeDownloads.set(id, controller);
  database.updateDownload(id, { state: "downloading", error: null });
  const partialPath = `${item.destinationPath}.part`;

  try {
    await mkdir(dirname(item.destinationPath), { recursive: true });
    const partialStat = existsSync(partialPath) ? await stat(partialPath) : null;
    const offset = partialStat?.size ?? 0;
    const headers: Record<string, string> = offset > 0 ? { Range: `bytes=${offset}-` } : {};
    const response = await fetch(item.url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok && response.status !== 206)
      throw new Error(`Download failed with HTTP ${response.status}`);
    if (!response.body) throw new Error("The server returned an empty download.");
    const resumed = offset > 0 && response.status === 206;
    const initialBytes = resumed ? offset : 0;
    const totalFromHeader = Number(response.headers.get("content-length"));
    const rangeTotal = Number(response.headers.get("content-range")?.split("/").at(-1));
    const totalBytes =
      Number.isFinite(rangeTotal) && rangeTotal > 0
        ? rangeTotal
        : Number.isFinite(totalFromHeader) && totalFromHeader > 0
          ? totalFromHeader + initialBytes
          : null;
    let receivedBytes = initialBytes;
    const startedAt = Date.now();
    let lastPersistAt = 0;
    let lastBroadcastAt = 0;
    database.updateDownload(id, { state: "downloading", totalBytes, receivedBytes, error: null });
    const reporter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedBytes += chunk.length;
        const now = Date.now();
        if (now - lastPersistAt >= 1000) {
          database.updateDownload(id, { receivedBytes, totalBytes });
          lastPersistAt = now;
        }
        if (now - lastBroadcastAt >= 200) {
          broadcastDownloadProgress({
            downloadId: id,
            receivedBytes,
            totalBytes,
            bytesPerSecond: Math.round(
              (receivedBytes - initialBytes) / Math.max((now - startedAt) / 1000, 1),
            ),
            state: "downloading",
          });
          lastBroadcastAt = now;
        }
        callback(null, chunk);
      },
    });
    const readable = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    await pipeline(
      readable,
      reporter,
      createWriteStream(partialPath, { flags: resumed ? "a" : "w" }),
      { signal: controller.signal },
    );
    await rename(partialPath, item.destinationPath);
    database.updateDownload(id, { state: "completed", receivedBytes, totalBytes, error: null });
    broadcastDownloadProgress({
      downloadId: id,
      receivedBytes,
      totalBytes,
      bytesPerSecond: 0,
      state: "completed",
    });
  } catch (error) {
    const cancelled = controller.signal.aborted;
    const message = error instanceof Error ? error.message : "Download failed";
    database.updateDownload(id, {
      state: cancelled ? "cancelled" : "failed",
      error: cancelled ? null : message,
    });
    broadcastDownloadProgress({
      downloadId: id,
      receivedBytes: database.getDownload(id)?.receivedBytes ?? 0,
      totalBytes: database.getDownload(id)?.totalBytes ?? null,
      bytesPerSecond: 0,
      state: cancelled ? "cancelled" : "failed",
    });
  } finally {
    activeDownloads.delete(id);
  }
}

function registerIpcHandlers(): void {
  registerHandler("app:version", noInput, () => app.getVersion());
  registerHandler("library:list", noInput, () => database.getGames());
  registerHandler("library:add-from-dialog", noInput, async (_input, event) => {
    const executable = await selectExecutable(getMainWindow(event));
    if (!executable) return null;
    const duplicate = database
      .getGames()
      .find((game) => game.executablePath?.toLowerCase() === executable.toLowerCase());
    return duplicate ?? database.addGame(libraryGameFromSelection(executable));
  });
  registerHandler("library:add-from-folder", noInput, async (_input, event) => {
    const parent = getMainWindow(event);
    const settings = database.getSettings(defaultSettings());
    const folderOptions: OpenDialogOptions = {
      title: "Select the game's installation folder",
      properties: ["openDirectory"],
      defaultPath: settings.installDirectory,
    };
    const folderResult = parent
      ? await dialog.showOpenDialog(parent, folderOptions)
      : await dialog.showOpenDialog(folderOptions);
    const folder = folderResult.canceled ? null : (folderResult.filePaths[0] ?? null);
    if (!folder) return null;
    const executable = await selectExecutable(parent, folder);
    if (!executable) return null;
    const relativePath = relative(resolve(folder), resolve(executable));
    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Choose an executable inside the selected game folder.");
    }
    const duplicate = database
      .getGames()
      .find((game) => game.executablePath?.toLowerCase() === executable.toLowerCase());
    return duplicate ?? database.addGame(libraryGameFromSelection(executable, folder));
  });
  registerHandler("library:set-executable", gameIdInput, async (id, event) => {
    const game = database.getGame(id);
    if (!game) throw new Error("Game not found");
    const executable = await selectExecutable(getMainWindow(event));
    if (!executable) throw new Error("Executable selection was cancelled.");
    const updated = database.setExecutable(id, executable, dirname(executable));
    const settings = database.getSettings(defaultSettings());
    const repackFolder = resolve(settings.downloadDirectory, safeGameFolderName(game.title));
    const downloadRoot = resolve(settings.downloadDirectory);
    const relativeRepack = relative(downloadRoot, repackFolder);
    if (
      relativeRepack &&
      relativeRepack !== ".." &&
      !relativeRepack.startsWith(`..${sep}`) &&
      !isAbsolute(relativeRepack) &&
      !resolve(executable).startsWith(`${repackFolder}${sep}`) &&
      (await containsSetupExecutable(repackFolder))
    ) {
      await rm(repackFolder, { recursive: true, force: true }).catch((error) => {
        console.warn(`Could not remove completed repack folder ${repackFolder}:`, error);
      });
    }
    return updated;
  });
  registerHandler("library:remove", gameIdInput, (id) => database.removeGame(id));
  registerHandler("library:uninstall", gameIdInput, async (id) => {
    const game = database.getGame(id);
    if (!game) throw new Error("Game not found");
    if (!game.executablePath || !game.installPath)
      throw new Error("Select the game folder and executable before uninstalling it.");
    const folder = resolve(game.installPath);
    const executable = relative(folder, resolve(game.executablePath));
    const root = parse(folder).root;
    if (
      !executable ||
      executable === ".." ||
      executable.startsWith(`..${sep}`) ||
      folder === root
    ) {
      throw new Error("The saved game folder is not safe to remove.");
    }
    const info = await stat(folder).catch(() => null);
    if (info?.isDirectory()) await rm(folder, { recursive: true, force: true });
    database.removeGame(id);
  });
  registerHandler("library:update", gameUpdateInput, ({ id, details }) =>
    database.updateGame(id, details),
  );
  registerHandler("library:choose-cover", gameIdInput, async (id, event) => {
    const game = database.getGame(id);
    if (!game) throw new Error("Game not found");
    const parent = getMainWindow(event);
    const options: OpenDialogOptions = {
      title: `Choose cover for ${game.title}`,
      properties: ["openFile"],
      filters: [{ name: "Game cover image", extensions: ["jpg", "jpeg", "png", "webp"] }],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return game;
    const source = result.filePaths[0];
    const extension = extname(source).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      throw new Error("Choose a JPG, PNG, or WebP image.");
    }
    const imageInfo = await stat(source);
    if (!imageInfo.isFile() || imageInfo.size === 0 || imageInfo.size > 15 * 1024 * 1024) {
      throw new Error("The cover image must be smaller than 15 MB.");
    }
    const filename = `${id}${extension}`;
    const coverDirectory = join(app.getPath("userData"), "covers");
    await mkdir(coverDirectory, { recursive: true });
    await copyFile(source, join(coverDirectory, filename));
    return database.setCover(id, `${appOrigin}/covers/${filename}`);
  });
  registerHandler("library:launch", gameIdInput, async (id) => {
    const game = database.getGame(id);
    if (!game?.executablePath || !existsSync(game.executablePath))
      throw new Error("Choose a valid executable for this game first.");
    const error = await shell.openPath(game.executablePath);
    if (error) throw new Error(error);
    database.markPlayed(id);
  });
  registerHandler("settings:get", noInput, () => database.getSettings(defaultSettings()));
  registerHandler("settings:storage", noInput, async () => {
    const settings = database.getSettings(defaultSettings());
    const info = await statfs(settings.installDirectory).catch(() => null);
    return info
      ? { totalBytes: info.blocks * info.bsize, freeBytes: info.bavail * info.bsize }
      : { totalBytes: null, freeBytes: null };
  });
  registerHandler("settings:choose-directory", directoryKindInput, async (kind, event) => {
    const parent = getMainWindow(event);
    const current = database.getSettings(defaultSettings());
    const defaultPath = kind === "download" ? current.downloadDirectory : current.installDirectory;
    const options: OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      defaultPath,
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const selected = result.canceled ? null : (result.filePaths[0] ?? null);
    if (selected) selectedDirectories.add(resolve(selected));
    return selected;
  });
  registerHandler("settings:save", settingsInput, async (settings) => {
    const current = database.getSettings(defaultSettings());
    const safe = {
      downloadDirectory: resolve(settings.downloadDirectory),
      installDirectory: resolve(settings.installDirectory),
    };
    for (const key of ["downloadDirectory", "installDirectory"] as const) {
      if (safe[key] !== resolve(current[key]) && !selectedDirectories.has(safe[key])) {
        throw new Error("Choose folders using the NEXUS folder picker.");
      }
    }
    selectedDirectories.delete(safe.downloadDirectory);
    selectedDirectories.delete(safe.installDirectory);
    await Promise.all([
      mkdir(safe.downloadDirectory, { recursive: true }),
      mkdir(safe.installDirectory, { recursive: true }),
    ]);
    return database.saveSettings(safe);
  });
  registerHandler("downloads:list", noInput, () => database.getDownloads());
  registerHandler("downloads:add", downloadUrlInput, async (rawUrl, event) => {
    const url = validateHttpUrl(rawUrl);
    const settings = database.getSettings(defaultSettings());
    const name = basename(new URL(url).pathname) || "download";
    const options: SaveDialogOptions = {
      defaultPath: join(settings.downloadDirectory, name),
    };
    const parent = getMainWindow(event);
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    const item: DownloadItem = {
      id: randomUUID(),
      title: basename(result.filePath),
      url,
      destinationPath: result.filePath,
      totalBytes: null,
      receivedBytes: 0,
      state: "queued",
      error: null,
      createdAt: new Date().toISOString(),
    };
    database.addDownload(item);
    void startDownload(item.id);
    return item;
  });
  registerHandler("downloads:cancel", gameIdInput, (id) => {
    activeDownloads.get(id)?.abort();
    const item = database.getDownload(id);
    if (item && !activeDownloads.has(id)) database.updateDownload(id, { state: "cancelled" });
  });
  registerHandler("downloads:resume", gameIdInput, (id) => {
    const item = database.getDownload(id);
    if (!item || item.state === "completed") throw new Error("Download cannot be resumed.");
    void startDownload(id);
  });
  registerHandler("library:add-metadata", metadataIdInput, async (id) => {
    const record = (await getMetadataCatalog()).find((game) => game.id === id);
    if (!record) throw new Error("Metadata item not found");
    const existing = database
      .getGames()
      .find((game) => game.title.toLocaleLowerCase() === record.title.toLocaleLowerCase());
    if (existing) return existing;
    return database.addGame({
      id: randomUUID(),
      title: record.title,
      description: record.description,
      genre: record.genre,
      releaseDate: record.releaseDate,
      developer: record.developer,
      publisher: record.publisher,
      cover: await cacheArtwork(record),
      executablePath: null,
      installPath: null,
      lastPlayedAt: null,
      createdAt: new Date().toISOString(),
    });
  });
  registerHandler("metadata:catalog", noInput, () => getMetadataCatalog());
  registerHandler("fitgirl:catalog", noInput, async () =>
    (await fitGirlCatalog.getCatalog()).map((game) => ({
      ...game,
      cover: game.cover ? `${appOrigin}/remote-image?url=${encodeURIComponent(game.cover)}` : "",
    })),
  );
  registerHandler("recommendations:catalog", noInput, async () => {
    if (recommendationCache && Date.now() - recommendationCache.fetchedAt < 15 * 60_000) {
      return recommendationCache.games.map((game) => ({
        ...game,
        cover: game.cover ? `${appOrigin}/remote-image?url=${encodeURIComponent(game.cover)}` : "",
      }));
    }
    const [response, chartsResponse] = await Promise.all([
      net.fetch("https://store.steampowered.com/api/featuredcategories/?cc=us&l=en"),
      net
        .fetch("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/")
        .catch(() => null),
    ]);
    if (!response.ok) throw new Error(`Steam recommendations unavailable (${response.status})`);
    const payload = (await response.json()) as Record<string, unknown>;
    const categories = [
      ["Top sellers", payload.top_sellers],
      ["New releases", payload.new_releases],
      ["Coming soon", payload.coming_soon],
    ] as const;
    const games = new Map<
      string,
      { id: string; title: string; category: string; cover: string; href: string; price: string }
    >();
    for (const [category, raw] of categories) {
      if (!raw || typeof raw !== "object") continue;
      const items = (raw as { items?: unknown }).items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const id = String(record.id ?? "");
        const title = typeof record.name === "string" ? record.name : "";
        if (!/^\d+$/.test(id) || !title) continue;
        const cover = [record.header_image, record.large_capsule, record.small_capsule].find(
          (value) => typeof value === "string" && value.startsWith("https://"),
        ) as string | undefined;
        const priceInfo = record.final_price as { final_formatted?: unknown } | undefined;
        const price =
          typeof priceInfo?.final_formatted === "string" ? priceInfo.final_formatted : "";
        const key = `${id}:${category}`;
        games.set(key, {
          id,
          title,
          category,
          cover: cover ?? "",
          href: `https://store.steampowered.com/app/${id}/`,
          price,
        });
      }
    }
    // Steam's public chart endpoint supplies current player rankings; resolve
    // the app names in one batched Store request so the Explore list is useful.
    if (chartsResponse?.ok) {
      try {
        const chartPayload = (await chartsResponse.json()) as {
          response?: { ranks?: { appid?: number; rank?: number }[] };
        };
        const ranks =
          chartPayload.response?.ranks
            ?.filter((entry) => Number.isInteger(entry.appid))
            .slice(0, 100) ?? [];
        const ids = ranks.map((entry) => String(entry.appid));
        if (ids.length) {
          const detailsResponse = await net.fetch(
            `https://store.steampowered.com/api/appdetails?appids=${ids.join(",")}&cc=us&l=en`,
          );
          if (detailsResponse.ok) {
            const details = (await detailsResponse.json()) as Record<
              string,
              { success?: boolean; data?: Record<string, unknown> }
            >;
            for (const entry of ranks) {
              const id = String(entry.appid);
              const game = details[id]?.data;
              if (!game || typeof game.name !== "string") continue;
              const cover =
                typeof game.header_image === "string"
                  ? game.header_image
                  : `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`;
              games.set(`${id}:Most played`, {
                id,
                title: game.name,
                category: "Most played",
                cover,
                href: `https://store.steampowered.com/app/${id}/`,
                price: "",
              });
            }
          }
        }
      } catch (error) {
        console.warn("Could not load Steam most-played chart:", error);
      }
    }
    if (games.size === 0) throw new Error("Steam returned no recommendation data");
    recommendationCache = { games: [...games.values()], fetchedAt: Date.now() };
    return recommendationCache.games.map((game) => ({
      ...game,
      cover: game.cover ? `${appOrigin}/remote-image?url=${encodeURIComponent(game.cover)}` : "",
    }));
  });
  registerHandler(
    "fitgirl:detail",
    z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9][a-z0-9-]*$/i),
    async (slug) => {
      const detail = await fitGirlCatalog.getGameDetail(slug);
      return {
        ...detail,
        cover: detail.cover
          ? `${appOrigin}/remote-image?url=${encodeURIComponent(detail.cover)}`
          : "",
        screenshots: detail.screenshots.map(
          (url) => `${appOrigin}/remote-image?url=${encodeURIComponent(url)}`,
        ),
      };
    },
  );

  registerHandler("library:add-external-metadata", externalMetadataInput, (input) => {
    const existing = database
      .getGames()
      .find((game) => game.title.toLocaleLowerCase() === input.title.toLocaleLowerCase());
    if (existing)
      return !existing.cover && input.cover
        ? database.setCover(existing.id, input.cover)
        : existing;
    return database.addGame({
      id: randomUUID(),
      title: input.title,
      description: input.description,
      genre: input.genre,
      releaseDate: input.releaseDate,
      developer: input.developer,
      publisher: input.publisher,
      cover: input.cover,
      executablePath: null,
      installPath: null,
      lastPlayedAt: null,
      createdAt: new Date().toISOString(),
    });
  });

  registerHandler("torrents:open", torrentUrlInput, async (url) => {
    await shell.openExternal(url);
  });

  /* ─────────────── BitTorrent Handlers ─────────────── */

  registerHandler("torrents:add", torrentAddInput, async ({ url, savePath }) => {
    await mkdir(savePath, { recursive: true });
    return new Promise<string>((resolve, reject) => {
      const torrent = torrentClient.add(url, { path: savePath });
      torrent.once("done", () => {
        const setup = torrent.files.find(
          (file) => basename(file.path).toLowerCase() === "setup.exe",
        );
        const setupPath = setup ? join(savePath, setup.path) : null;
        // A completed torrent should not keep uploading. Close WebTorrent's chunk
        // store while preserving the downloaded files so setup can inspect them.
        torrent.destroy({}, (closeError) => {
          if (closeError) {
            console.error("Could not release completed torrent files:", closeError);
            return;
          }
          if (!setupPath) return;
          void shell.openPath(setupPath).then((error) => {
            if (error) console.error(`Could not open game setup: ${error}`);
          });
        });
      });
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        torrent.destroy();
        reject(new Error("Timed out while reading the torrent. Check the link and try again."));
      }, 60_000);
      const finish = (infoHash: string) => {
        if (settled || !infoHash) return;
        settled = true;
        clearTimeout(timeout);
        resolve(infoHash);
      };
      torrent.on("infoHash", () => finish(torrent.infoHash));
      torrent.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(err));
      });
      finish(torrent.infoHash);
    });
  });

  registerHandler("torrents:list", noInput, () => {
    return torrentClient.torrents.map((t) => ({
      infoHash: t.infoHash,
      name: t.name || "Loading...",
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      numPeers: t.numPeers,
      timeRemaining: t.timeRemaining,
      downloaded: t.downloaded,
      length: t.length || 0,
      savePath: t.path,
      state: t.paused
        ? ("paused" as const)
        : t.done
          ? ("seeding" as const)
          : ("downloading" as const),
    }));
  });

  registerHandler("torrents:pause", z.string(), async (infoHash) => {
    const torrent = await torrentClient.get(infoHash);
    if (torrent) torrent.pause();
  });

  registerHandler("torrents:resume", z.string(), async (infoHash) => {
    const torrent = await torrentClient.get(infoHash);
    if (torrent) torrent.resume();
  });

  registerHandler("torrents:remove", z.string(), async (infoHash) => {
    const torrent = await torrentClient.get(infoHash);
    if (torrent) {
      torrent.destroy();
    }
  });
}

async function serveRenderer(): Promise<void> {
  const rendererDirectory = app.isPackaged
    ? join(process.resourcesPath, "renderer")
    : join(app.getAppPath(), ".output", "public");

  await protocol.handle(appScheme, async (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/remote-image") {
      const source = new URL(requestUrl.searchParams.get("url") ?? "");
      if (source.protocol !== "https:" || !source.hostname.includes(".")) {
        return new Response("Invalid image URL", { status: 400 });
      }
      try {
        const response = await net.fetch(source.toString(), {
          headers: { Referer: "https://fitgirl-repacks.site/" },
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !contentType.startsWith("image/")) {
          return new Response("Image unavailable", { status: 404 });
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength > 15 * 1024 * 1024)
          return new Response("Image too large", { status: 413 });
        return new Response(bytes, {
          headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
        });
      } catch {
        return new Response("Image unavailable", { status: 502 });
      }
    }
    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
    const isCover = requestedPath.startsWith("covers/");
    const baseDirectory = isCover ? join(app.getPath("userData"), "covers") : rendererDirectory;
    const relativePath = isCover
      ? requestedPath.slice("covers/".length)
      : requestedPath || "_shell.html";
    const candidate = resolve(baseDirectory, relativePath);
    const insideDirectory =
      candidate === baseDirectory || candidate.startsWith(`${baseDirectory}${sep}`);
    const filePath =
      insideDirectory && existsSync(candidate) ? candidate : join(rendererDirectory, "_shell.html");
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function applyContentSecurityPolicy(window: BrowserWindow): void {
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(`${appOrigin}/`)) {
      callback({});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        ],
      },
    });
  });
}

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#10131f",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (input.key === "Escape" && window.isFullScreen()) {
      window.setFullScreen(false);
    }
  });

  applyContentSecurityPolicy(window);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${appOrigin}/`) || url.startsWith(`${devServerUrl}/`)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
  });

  if (app.isPackaged) {
    await window.loadURL(`${appOrigin}/`);
  } else {
    await window.loadURL(devServerUrl);
  }
}

let lastTorrentBroadcast = 0;
function broadcastTorrentProgress(): void {
  if (!torrentClient || torrentClient.torrents.length === 0) return;
  const now = Date.now();
  if (now - lastTorrentBroadcast < 1000) return;
  lastTorrentBroadcast = now;

  const statuses: TorrentStatus[] = torrentClient.torrents.map((t) => ({
    infoHash: t.infoHash,
    name: t.name || "Loading...",
    progress: t.progress,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    numPeers: t.numPeers,
    timeRemaining: t.timeRemaining,
    downloaded: t.downloaded,
    length: t.length || 0,
    savePath: t.path,
    state: t.paused ? "paused" : t.done ? "seeding" : "downloading",
  }));

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("torrents:progress", statuses);
  }
}

app
  .whenReady()
  .then(async () => {
    await initializeDatabase();
    const { default: WebTorrentClient } = await import("webtorrent");
    torrentClient = new WebTorrentClient({
      maxConns: 50,
    });
    setInterval(broadcastTorrentProgress, 1000);
    registerIpcHandlers();
    if (app.isPackaged) await serveRenderer();
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    });
  })
  .catch((error: unknown) => {
    console.error("NEXUS failed to start", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
