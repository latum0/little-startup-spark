import { createServerFn } from "@tanstack/react-start";

export interface FreeToGameRecord {
  id: number;
  title: string;
  genre: string;
  release_date: string;
  short_description: string;
  developer: string;
  publisher: string;
  thumbnail: string;
  game_url: string;
}

export const getFreeToGameCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const response = await fetch("https://www.freetogame.com/api/games?platform=all");
  if (!response.ok) throw new Error(`FreeToGame returned ${response.status}`);
  return (await response.json()) as FreeToGameRecord[];
});
