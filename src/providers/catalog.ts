import type { Game } from "@/types/game";
import { games } from "@/data/mockGames";
import { getFreeToGameCatalog, type FreeToGameRecord } from "@/lib/gameCatalog.functions";
import type { MetadataRecord } from "../../electron/shared.cjs";

export interface CatalogGame {
  id: string;
  title: string;
  genre: string;
  releaseYear: number | null;
  description: string;
  developer: string;
  publisher: string;
  cover: string;
  href: string;
  sourceId?: number;
}

export interface GameProvider {
  id: string;
  name: string;
  attribution: { label: string; href: string };
  getGames(): Promise<CatalogGame[]>;
}

const fromDemoGame = (game: Game): CatalogGame => ({
  id: game.id,
  title: game.title,
  genre: game.genre,
  releaseYear: game.releaseYear,
  description: game.description,
  developer: game.developer,
  publisher: game.publisher,
  cover: game.cover,
  href: `/games/${game.id}`,
});

const demoProvider: GameProvider = {
  id: "demo",
  name: "NEXUS Demo Catalog",
  attribution: { label: "NEXUS sample catalog", href: "/" },
  async getGames() {
    return games.map(fromDemoGame);
  },
};

const freeToGameProvider: GameProvider = {
  id: "freetogame",
  name: "FreeToGame",
  attribution: { label: "FreeToGame.com", href: "https://www.freetogame.com/" },
  async getGames() {
    const records: (FreeToGameRecord | MetadataRecord)[] = window.nexus
      ? await window.nexus.getMetadataCatalog()
      : await getFreeToGameCatalog();
    return records.map((game) => {
      const desktopRecord = "gameUrl" in game;
      const releaseDate = desktopRecord ? game.releaseDate : game.release_date;
      return {
        id: `freetogame-${game.id}`,
        sourceId: game.id,
        title: game.title,
        genre: game.genre || "Unknown genre",
        releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) || null : null,
        description:
          (desktopRecord ? game.description : game.short_description) ||
          "No description available.",
        developer: game.developer || "Unknown developer",
        publisher: game.publisher || "Unknown publisher",
        cover: desktopRecord ? game.thumbnail : game.thumbnail,
        href: desktopRecord ? game.gameUrl : game.game_url,
      };
    });
  },
};

export const gameProviders: GameProvider[] = [demoProvider, freeToGameProvider];
