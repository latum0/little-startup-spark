export interface SteamSearchItem {
  id?: number;
  name?: string;
}

const cleanTitle = (value: string) =>
  value
    .replace(/\[[^\]]*(?:repack|fitgirl|dodi|version|build)[^\]]*\]/gi, " ")
    .replace(/\([^)]*(?:repack|fitgirl|dodi|version|build)[^)]*\)/gi, " ")
    .replace(/\b(?:v(?:ersion)?\s*)?\d+(?:[._-]\d+){1,}\b/gi, " ")
    .replace(/\b(?:fitgirl|dodi|repack|portable|preinstalled)\b.*$/i, " ")
    .replace(/\b(?:deluxe|ultimate|complete|definitive|goty)\s+edition\b/gi, " ")
    .replace(/\b(?:directors|director's)\s+cut\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeGameTitle = (value: string) =>
  cleanTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function rankSteamSearchResults(title: string, items: SteamSearchItem[]) {
  const wanted = normalizeGameTitle(title);
  const ignoredWords = new Set(["the", "and", "for", "with", "game", "edition", "version"]);
  const wordsForMatch = (value: string) =>
    new Set(
      normalizeGameTitle(value)
        .split(" ")
        .filter((word) => word.length > 1 && !ignoredWords.has(word)),
    );
  const target = wordsForMatch(wanted);
  const valid = items.filter(
    (item): item is { id: number; name: string } => Number.isInteger(item.id) && Boolean(item.name),
  );
  const score = (name: string) => {
    const words = wordsForMatch(name);
    if (!words.size || !target.size) return 0;
    const overlap = [...words].filter((word) => target.has(word)).length;
    const tokenScore = (overlap / target.size) * 0.75 + (overlap / words.size) * 0.25;
    const overlapScore = overlap / new Set([...target, ...words]).size;
    return Math.max(tokenScore * 0.5, overlapScore);
  };
  return valid
    .map((item) => ({
      ...item,
      score: normalizeGameTitle(item.name) === wanted ? 1 : score(item.name),
    }))
    .sort((a, b) => b.score - a.score);
}

export function isConfidentSteamMatch(score: number, title: string) {
  const meaningfulWords = normalizeGameTitle(title)
    .split(" ")
    .filter((word) => word.length > 1);
  return score >= (meaningfulWords.length <= 1 ? 0.5 : 0.68);
}
