export type GameStatus = "installed" | "available" | "unavailable";

export interface Game {
  id: string;
  title: string;
  tagline: string;
  description: string;
  genre: string;
  category: "Action" | "Adventure" | "Racing" | "RPG";
  releaseYear: number;
  releaseDate: string;
  developer: string;
  publisher: string;
  sizeGB: number;
  cover: string;
  screenshots: string[];
  status: GameStatus;
  popularity: number;
  requirements: { os: string; cpu: string; gpu: string; ram: string };
}

export interface InstalledGame {
  gameId: string;
  location: string;
  lastPlayed: string;
}

export interface Download {
  id: string;
  gameId: string;
  progress: number;
  speedMBs: number;
  state: "active" | "paused" | "queued" | "completed";
}
