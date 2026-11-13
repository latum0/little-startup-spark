import type { Game } from "@/types/game";
import { games } from "@/data/mockGames";
import {
  getFitGirlCatalog,
  getFreeToGameCatalog,
  type FreeToGameRecord,
} from "@/lib/gameCatalog.functions";
import type { GameRecommendation, MetadataRecord } from "../../electron/shared.cjs";

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
  /** FreeToGame numeric ID. Used for the "Add to library" shortcut. */
  sourceId?: number;
  /** Slug-based ID (FitGirl, etc.). */
  slug?: string;
  recommendationCategory?: string;
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
        cover: game.thumbnail,
        href: desktopRecord ? game.gameUrl : game.game_url,
      };
    });
  },
};

const fitGirlProvider: GameProvider = {
  id: "fitgirl",
  name: "FitGirl Repacks",
  attribution: { label: "FitGirl Repacks", href: "https://fitgirl-repacks.site/" },
  async getGames() {
    const records = window.nexus
      ? await window.nexus.getFitGirlCatalog()
      : await getFitGirlCatalog();
    return records.map<CatalogGame>((game) => ({
      id: `fitgirl-${game.id}`,
      slug: game.id,
      title: game.title,
      genre: "PC Repack",
      releaseYear: null,
      description: "Open the game to see the full repack details and download the torrent.",
      developer: "FitGirl",
      publisher: "FitGirl Repacks",
      cover: game.cover,
      href: `/games/fitgirl/${game.id}`,
    }));
  },
};

const steamRecommendationsProvider: GameProvider = {
  id: "steam-recommendations",
  name: "Steam recommendations",
  attribution: { label: "Steam Store charts", href: "https://store.steampowered.com/charts/" },
  async getGames() {
    if (!window.nexus) return [];
    const records: GameRecommendation[] = await window.nexus.getGameRecommendations();
    return records.map((game) => ({
      id: `steam-${game.id}-${game.category}`,
      title: game.title,
      genre: game.category,
      releaseYear: null,
      description: `${game.category} on Steam.`,
      developer: "Steam Store",
      publisher: "Steam",
      cover: game.cover,
      href: game.href,
      recommendationCategory: game.category,
    }));
  },
};

export const gameProviders: GameProvider[] = [
  steamRecommendationsProvider,
  fitGirlProvider,
  demoProvider,
  freeToGameProvider,
];
