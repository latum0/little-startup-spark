import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import initSqlJs from "sql.js";
import type { SqlJsStatic } from "sql.js";
import type { NexusDatabase as NexusDatabaseType } from "../../electron/database.cjs";
import type { AppSettings, LibraryGame, MetadataRecord } from "../../electron/shared.cts";

const require = createRequire(import.meta.url);
const { NexusDatabase } =
  require("../../electron-dist/database.cjs") as typeof import("../../electron/database.cjs");
let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

describe("NexusDatabase", () => {
  let database: NexusDatabaseType | undefined;
  let temporaryDirectory: string | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  });

  it("persists a selected game and removes only its library record", () => {
    database = new NexusDatabase(":memory:", SQL);
    const game: LibraryGame = {
      id: randomUUID(),
      title: "Local Game",
      description: "",
      genre: "",
      releaseDate: "",
      developer: "",
      publisher: "",
      cover: null,
      executablePath: "C:\\Games\\Local Game\\game.exe",
      installPath: "C:\\Games\\Local Game",
      lastPlayedAt: null,
      createdAt: new Date().toISOString(),
    };

    database.addGame(game);
    expect(database.getGame(game.id)).toMatchObject(game);
    database.markPlayed(game.id);
    expect(database.getGame(game.id)?.lastPlayedAt).toBeTruthy();
    database.removeGame(game.id);
    expect(database.getGame(game.id)).toBeUndefined();
  });

  it("stores settings and metadata cache in SQLite", () => {
    database = new NexusDatabase(":memory:", SQL);
    const settings: AppSettings = {
      downloadDirectory: "C:\\NEXUS\\Downloads",
      installDirectory: "C:\\NEXUS\\Games",
    };
    const metadata: MetadataRecord[] = [
      {
        id: 42,
        title: "Open Game",
        genre: "Action",
        releaseDate: "2024-01-01",
        description: "A legal free game",
        developer: "Studio",
        publisher: "Studio",
        thumbnail: "https://example.com/cover.jpg",
        gameUrl: "https://example.com/game",
      },
    ];

    database.saveSettings(settings);
    database.saveMetadataCache("provider:all", metadata);
    expect(database.getSettings({ downloadDirectory: "", installDirectory: "" })).toEqual(settings);
    expect(database.getMetadataCache("provider:all")).toEqual(metadata);
  });

  it("reloads games from the SQLite file after reopening", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "nexus-db-"));
    const databasePath = join(temporaryDirectory, "nexus.sqlite");
    const game: LibraryGame = {
      id: randomUUID(),
      title: "Persistent Game",
      description: "",
      genre: "",
      releaseDate: "",
      developer: "",
      publisher: "",
      cover: null,
      executablePath: null,
      installPath: null,
      lastPlayedAt: null,
      createdAt: new Date().toISOString(),
    };
    database = new NexusDatabase(databasePath, SQL);
    database.addGame(game);
    database.close();
    database = new NexusDatabase(databasePath, SQL);

    expect(database.getGame(game.id)?.title).toBe("Persistent Game");
  });
});
