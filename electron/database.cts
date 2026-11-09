import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SqlJsStatic, SqlValue } from "sql.js";
import type {
  AppSettings,
  DownloadItem,
  GameMetadataInput,
  LibraryGame,
  MetadataRecord,
} from "./shared.cjs";

type QueryParameters = SqlValue[] | Record<string, SqlValue> | null | undefined;

class PersistentSqlite {
  private readonly db: InstanceType<SqlJsStatic["Database"]>;
  private transactionDepth = 0;

  constructor(
    private readonly path: string,
    sql: SqlJsStatic,
  ) {
    const file =
      path !== ":memory:" && existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined;
    this.db = new sql.Database(file);
  }

  pragma(_statement: string): void {
    // sql.js uses an in-memory database; durability is provided by export-to-file after writes.
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.persist();
  }

  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => this.queryRows(sql, args),
      get: (...args: unknown[]) => this.queryRows(sql, args)[0],
      run: (...args: unknown[]) => this.execute(sql, args),
    };
  }

  transaction<T>(callback: () => T): () => T {
    return () => {
      this.db.run("BEGIN TRANSACTION");
      this.transactionDepth++;
      try {
        const result = callback();
        this.db.run("COMMIT");
        this.transactionDepth--;
        this.persist();
        return result;
      } catch (error) {
        this.db.run("ROLLBACK");
        this.transactionDepth--;
        throw error;
      }
    };
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  private queryRows(sql: string, args: unknown[]): Record<string, unknown>[] {
    const statement = this.db.prepare(sql);
    const values = this.normalize(args);
    if (values) statement.bind(values);
    const rows: Record<string, unknown>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
  }

  private execute(sql: string, args: unknown[]): { changes: number } {
    this.db.run(sql, this.normalize(args));
    const changes = this.db.getRowsModified();
    this.persist();
    return { changes };
  }

  private normalize(args: unknown[]): QueryParameters {
    if (args.length === 0) return null;
    if (args.length === 1 && args[0] === undefined) return null;
    if (args.length === 1 && Array.isArray(args[0])) return args[0] as SqlValue[];
    if (args.length === 1 && args[0] !== null && typeof args[0] === "object") {
      return Object.fromEntries(
        Object.entries(args[0] as Record<string, SqlValue>).map(([key, value]) => [
          key.startsWith("@") || key.startsWith(":") || key.startsWith("$") ? key : `@${key}`,
          value,
        ]),
      );
    }
    return args as SqlValue[];
  }

  private persist(): void {
    if (this.path !== ":memory:" && this.transactionDepth === 0) {
      writeFileSync(this.path, this.db.export());
    }
  }
}

export class NexusDatabase {
  private readonly db: PersistentSqlite;

  constructor(path: string, sql: SqlJsStatic) {
    this.db = new PersistentSqlite(path, sql);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        genre TEXT NOT NULL DEFAULT '',
        release_date TEXT NOT NULL DEFAULT '',
        developer TEXT NOT NULL DEFAULT '',
        publisher TEXT NOT NULL DEFAULT '',
        cover TEXT,
        executable_path TEXT,
        install_path TEXT,
        last_played_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS games_executable_path ON games(executable_path) WHERE executable_path IS NOT NULL;
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        destination_path TEXT NOT NULL,
        total_bytes INTEGER,
        received_bytes INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metadata_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    this.db.prepare("UPDATE downloads SET state = 'cancelled' WHERE state = 'downloading'").run();
  }

  getGames(): LibraryGame[] {
    return this.db
      .prepare(
        `SELECT id, title, description, genre, release_date AS releaseDate,
      developer, publisher, cover, executable_path AS executablePath, install_path AS installPath,
      last_played_at AS lastPlayedAt, created_at AS createdAt FROM games ORDER BY title COLLATE NOCASE`,
      )
      .all() as unknown as LibraryGame[];
  }

  getGame(id: string): LibraryGame | undefined {
    return this.db
      .prepare(
        `SELECT id, title, description, genre, release_date AS releaseDate,
      developer, publisher, cover, executable_path AS executablePath, install_path AS installPath,
      last_played_at AS lastPlayedAt, created_at AS createdAt FROM games WHERE id = ?`,
      )
      .get(id) as unknown as LibraryGame | undefined;
  }

  addGame(game: LibraryGame): LibraryGame {
    this.db
      .prepare(
        `INSERT INTO games (id, title, description, genre, release_date, developer, publisher,
      cover, executable_path, install_path, created_at) VALUES (@id, @title, @description, @genre,
      @releaseDate, @developer, @publisher, @cover, @executablePath, @installPath, @createdAt)`,
      )
      .run(game);
    return game;
  }

  setExecutable(id: string, executablePath: string, installPath: string): LibraryGame {
    this.db
      .prepare("UPDATE games SET executable_path = ?, install_path = ? WHERE id = ?")
      .run(executablePath, installPath, id);
    const game = this.getGame(id);
    if (!game) throw new Error("Game not found");
    return game;
  }

  updateGame(id: string, details: GameMetadataInput): LibraryGame {
    this.db
      .prepare(
        `UPDATE games SET title = ?, description = ?, genre = ?, release_date = ?, developer = ?, publisher = ? WHERE id = ?`,
      )
      .run(
        details.title,
        details.description,
        details.genre,
        details.releaseDate,
        details.developer,
        details.publisher,
        id,
      );
    const game = this.getGame(id);
    if (!game) throw new Error("Game not found");
    return game;
  }

  removeGame(id: string): void {
    this.db.prepare("DELETE FROM games WHERE id = ?").run(id);
  }

  markPlayed(id: string): void {
    this.db
      .prepare("UPDATE games SET last_played_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  getSettings(defaults: AppSettings): AppSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];
    return rows.reduce(
      (settings, row) => {
        if (row.key === "downloadDirectory" || row.key === "installDirectory")
          settings[row.key] = row.value;
        return settings;
      },
      { ...defaults },
    );
  }

  saveSettings(settings: AppSettings): AppSettings {
    const save = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    const transaction = this.db.transaction(() => {
      save.run("downloadDirectory", settings.downloadDirectory);
      save.run("installDirectory", settings.installDirectory);
    });
    transaction();
    return settings;
  }

  getDownloads(): DownloadItem[] {
    return this.db
      .prepare(
        `SELECT id, title, url, destination_path AS destinationPath, total_bytes AS totalBytes,
      received_bytes AS receivedBytes, state, error, created_at AS createdAt FROM downloads ORDER BY created_at DESC`,
      )
      .all() as unknown as DownloadItem[];
  }

  getDownload(id: string): DownloadItem | undefined {
    return this.db
      .prepare(
        `SELECT id, title, url, destination_path AS destinationPath, total_bytes AS totalBytes,
      received_bytes AS receivedBytes, state, error, created_at AS createdAt FROM downloads WHERE id = ?`,
      )
      .get(id) as unknown as DownloadItem | undefined;
  }

  addDownload(item: DownloadItem): void {
    this.db
      .prepare(
        `INSERT INTO downloads (id, title, url, destination_path, total_bytes, received_bytes, state, error, created_at)
      VALUES (@id, @title, @url, @destinationPath, @totalBytes, @receivedBytes, @state, @error, @createdAt)`,
      )
      .run(item);
  }

  updateDownload(
    id: string,
    update: Partial<Pick<DownloadItem, "totalBytes" | "receivedBytes" | "state" | "error">>,
  ): void {
    const current = this.getDownload(id);
    if (!current) return;
    const totalBytes = update.totalBytes === undefined ? current.totalBytes : update.totalBytes;
    const receivedBytes =
      update.receivedBytes === undefined ? current.receivedBytes : update.receivedBytes;
    const state = update.state === undefined ? current.state : update.state;
    const error = update.error === undefined ? current.error : update.error;
    this.db
      .prepare(
        `UPDATE downloads SET total_bytes = ?, received_bytes = ?, state = ?, error = ? WHERE id = ?`,
      )
      .run(totalBytes, receivedBytes, state, error, id);
  }

  getMetadataCache(key: string): MetadataRecord[] | undefined {
    const cached = this.db
      .prepare("SELECT payload, expires_at FROM metadata_cache WHERE cache_key = ?")
      .get(key) as { payload: string; expires_at: number } | undefined;
    if (!cached) return undefined;
    if (cached.expires_at <= Date.now()) {
      this.db.prepare("DELETE FROM metadata_cache WHERE cache_key = ?").run(key);
      return undefined;
    }
    return JSON.parse(cached.payload) as MetadataRecord[];
  }

  saveMetadataCache(key: string, records: MetadataRecord[]): void {
    this.db
      .prepare(
        `INSERT INTO metadata_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at`,
      )
      .run(key, JSON.stringify(records), Date.now() + 60 * 60 * 1000);
  }

  close(): void {
    this.db.close();
  }
}
