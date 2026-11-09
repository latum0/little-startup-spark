import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from "electron";
import { existsSync } from "node:fs";
import { mkdir, rename, stat, statfs, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import initSqlJs from "sql.js";
import { NexusDatabase } from "./database.cjs";
import type {
  AppSettings,
  DownloadItem,
  DownloadProgress,
  LibraryGame,
  MetadataRecord,
} from "./shared.cjs";

const appScheme = "nexus";
const appOrigin = `${appScheme}://app`;
const devServerUrl = process.env.NEXUS_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
let database: NexusDatabase;
const activeDownloads = new Map<string, AbortController>();
const selectedDirectories = new Set<string>();

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

function defaultSettings(): AppSettings {
  const root = join(app.getPath("home"), "Games", "NEXUS");
  return { downloadDirectory: join(app.getPath("downloads"), "NEXUS"), installDirectory: root };
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
  if (!app.isPackaged) return record.thumbnail;
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
    if (!database.getGame(id)) throw new Error("Game not found");
    const executable = await selectExecutable(getMainWindow(event));
    if (!executable) throw new Error("Executable selection was cancelled.");
    return database.setExecutable(id, executable, dirname(executable));
  });
  registerHandler("library:remove", gameIdInput, (id) => database.removeGame(id));
  registerHandler("library:update", gameUpdateInput, ({ id, details }) =>
    database.updateGame(id, details),
  );
  registerHandler("library:launch", gameIdInput, async (id) => {
    const game = database.getGame(id);
    if (!game?.executablePath || !existsSync(game.executablePath))
      throw new Error("Choose a valid executable for this game first.");
    const child = spawn(game.executablePath, [], {
      cwd: game.installPath ?? dirname(game.executablePath),
      detached: true,
      stdio: "ignore",
    });
    await new Promise<void>((resolveLaunch, rejectLaunch) => {
      child.once("error", rejectLaunch);
      child.once("spawn", resolveLaunch);
    });
    child.unref();
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
}

async function serveRenderer(): Promise<void> {
  const rendererDirectory = app.isPackaged
    ? join(process.resourcesPath, "renderer")
    : join(app.getAppPath(), ".output", "public");

  await protocol.handle(appScheme, async (request) => {
    const requestUrl = new URL(request.url);
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
    backgroundColor: "#10131f",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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

app
  .whenReady()
  .then(async () => {
    await initializeDatabase();
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
