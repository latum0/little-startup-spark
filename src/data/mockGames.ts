import g1 from "@/assets/g1.jpg";
import g2 from "@/assets/g2.jpg";
import g3 from "@/assets/g3.jpg";
import g4 from "@/assets/g4.jpg";
import type { Download, Game, InstalledGame } from "@/types/game";

const req = { os: "Windows 10/11 64-bit", cpu: "Intel i5-10400 / Ryzen 5 3600", gpu: "RTX 2070 / RX 6600", ram: "16 GB" };
const shots = [g1, g2, g3, g4];

const base = (g: Omit<Game, "screenshots" | "requirements">): Game => ({ ...g, screenshots: shots.filter((s) => s !== g.cover), requirements: req });

export const games: Game[] = [
  base({ id: "starfall", title: "Starfall Horizon", tagline: "Beyond the last city lies the first frontier.", description: "Explore a shattered star system, rebuild humanity's last outpost and uncover the signal calling from the edge of known space.", genre: "Sci-Fi Action", category: "Action", releaseYear: 2026, releaseDate: "Mar 14, 2026", developer: "Lumen Forge", publisher: "Nexus Originals", sizeGB: 92.4, cover: g1, status: "installed", popularity: 98 }),
  base({ id: "ashen", title: "Ashen Oath", tagline: "Every vow has a price.", description: "A punishing dark-fantasy RPG set in a kingdom swallowed by mist. Forge your oath, master your blade and face gods long forgotten.", genre: "Dark Fantasy RPG", category: "RPG", releaseYear: 2025, releaseDate: "Oct 2, 2025", developer: "Grey Hollow", publisher: "Vanta Interactive", sizeGB: 68.1, cover: g2, status: "installed", popularity: 95 }),
  base({ id: "neon", title: "Neon Apex", tagline: "Own the night.", description: "High-speed street racing through a rain-soaked megacity. Build your ride, climb the underground circuit and outrun the law.", genre: "Arcade Racing", category: "Racing", releaseYear: 2025, releaseDate: "Jun 20, 2025", developer: "Redline Labs", publisher: "Nexus Originals", sizeGB: 54.7, cover: g3, status: "available", popularity: 89 }),
  base({ id: "verdant", title: "Lost Verdant", tagline: "The jungle remembers.", description: "Chart forgotten ruins across an untamed valley in a sweeping open-world adventure full of puzzles, climbing and ancient secrets.", genre: "Open-World Adventure", category: "Adventure", releaseYear: 2024, releaseDate: "Nov 8, 2024", developer: "Canopy Studio", publisher: "Wildlight", sizeGB: 76.3, cover: g4, status: "available", popularity: 91 }),
  base({ id: "orbit", title: "Orbit Breakers", tagline: "Zero gravity. Zero mercy.", description: "Squad-based tactical shooter set aboard derelict orbital stations.", genre: "Tactical Shooter", category: "Action", releaseYear: 2026, releaseDate: "Jan 30, 2026", developer: "Lumen Forge", publisher: "Nexus Originals", sizeGB: 48.9, cover: g1, status: "available", popularity: 84 }),
  base({ id: "requiem", title: "Requiem of Ash", tagline: "The cathedral calls.", description: "A standalone expansion delving deeper into the mist-bound kingdom.", genre: "Action RPG", category: "RPG", releaseYear: 2026, releaseDate: "Feb 18, 2026", developer: "Grey Hollow", publisher: "Vanta Interactive", sizeGB: 31.2, cover: g2, status: "unavailable", popularity: 80 }),
  base({ id: "drift", title: "Drift Protocol", tagline: "Every corner counts.", description: "Precision drift racing with a deep tuning system and global leaderboards.", genre: "Sim Racing", category: "Racing", releaseYear: 2024, releaseDate: "Aug 1, 2024", developer: "Redline Labs", publisher: "Torque", sizeGB: 39.5, cover: g3, status: "installed", popularity: 77 }),
  base({ id: "temple", title: "Temple of Echoes", tagline: "Listen closely.", description: "A cozy puzzle adventure through singing ruins hidden in the jungle.", genre: "Puzzle Adventure", category: "Adventure", releaseYear: 2026, releaseDate: "Apr 4, 2026", developer: "Canopy Studio", publisher: "Wildlight", sizeGB: 12.8, cover: g4, status: "available", popularity: 72 }),
];

export const getGame = (id: string) => games.find((g) => g.id === id);

export const featuredGameId = "starfall";
export const recentlyAddedIds = ["temple", "requiem", "orbit", "starfall"];

export const installedGames: InstalledGame[] = [
  { gameId: "starfall", location: "D:\\Games\\Nexus\\Starfall Horizon", lastPlayed: "2 hours ago" },
  { gameId: "ashen", location: "D:\\Games\\Nexus\\Ashen Oath", lastPlayed: "Yesterday" },
  { gameId: "drift", location: "C:\\Nexus\\Library\\Drift Protocol", lastPlayed: "5 days ago" },
];

export const mockDownloads: Download[] = [
  { id: "d1", gameId: "neon", progress: 62, speedMBs: 48.2, state: "active" },
  { id: "d2", gameId: "verdant", progress: 0, speedMBs: 0, state: "queued" },
  { id: "d3", gameId: "temple", progress: 0, speedMBs: 0, state: "queued" },
  { id: "d4", gameId: "drift", progress: 100, speedMBs: 0, state: "completed" },
];

export const categories = ["All", "Action", "Adventure", "Racing", "RPG"] as const;
