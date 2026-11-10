import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* ──────────────────────────── FreeToGame ──────────────────────────── */

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

/* ───────────────────────────── FitGirl ───────────────────────────── */

const FITGIRL_BASE = "https://fitgirl-repacks.site";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NON_GAME_SLUGS = new Set([
  "about",
  "contact",
  "faq",
  "dmca",
  "privacy",
  "disclaimer",
  "category",
  "tag",
  "page",
  "feed",
  "wp-content",
  "wp-admin",
  "wp-login",
  "sitemap",
  "donate",
  "support",
  "recover-password",
  "rules",
]);

async function fetchFitGirlHtml(path: string): Promise<string> {
  const response = await fetch(`${FITGIRL_BASE}${path}`, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`FitGirl returned HTTP ${response.status}`);
  return response.text();
}

export interface FitGirlGameSummary {
  id: string;
  title: string;
  cover: string;
  href: string;
}

export interface FitGirlTorrent {
  label: string;
  url: string;
}

export interface FitGirlGameDetail {
  id: string;
  title: string;
  cover: string;
  description: string;
  genre: string;
  releaseYear: number | null;
  developer: string;
  publisher: string;
  sizeGB: string | null;
  torrents: FitGirlTorrent[];
  screenshots: string[];
  originalUrl: string;
}

function cleanText(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#0*8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("fitgirl-repacks.site")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    const slug = parts[0]!;
    if (NON_GAME_SLUGS.has(slug.toLowerCase())) return null;
    return slug;
  } catch {
    return null;
  }
}

export const getFitGirlCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const html = await fetchFitGirlHtml("/");
  const games: FitGirlGameSummary[] = [];
  const seen = new Set<string>();

  // Preferred: parse <article> blocks so we can correlate cover images with links.
  const articleBlocks = html.match(/<article[\s\S]*?<\/article>/gi) ?? [];
  for (const block of articleBlocks) {
    const linkMatch =
      block.match(
        /<h[1-3][^>]*>\s*<a[^>]+href="(https?:\/\/fitgirl-repacks\.site\/[^"]+)"[^>]*>([^<]{3,300})<\/a>/i,
      ) ??
      block.match(
        /<a[^>]+href="(https?:\/\/fitgirl-repacks\.site\/[^"]+)"[^>]*>([^<]{3,300})<\/a>/i,
      );
    if (!linkMatch) continue;
    const href = linkMatch[1] ?? "";
    const title = cleanText(linkMatch[2] ?? "");
    const slug = extractSlug(href);
    if (!slug || !title || seen.has(slug)) continue;
    seen.add(slug);
    const imgMatch =
      block.match(/<img[^>]+data-src="([^"]+)"/i) ?? block.match(/<img[^>]+src="([^"]+)"/i);
    games.push({ id: slug, title, cover: imgMatch?.[1] ?? "", href });
  }

  // Fallback: link-only scan if the theme doesn't use <article>.
  if (games.length === 0) {
    const linkRegex =
      /<a[^>]+href="(https?:\/\/fitgirl-repacks\.site\/[^"]+)"[^>]*>([^<]{3,300})<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1] ?? "";
      const title = cleanText(m[2] ?? "");
      const slug = extractSlug(href);
      if (!slug || !title || seen.has(slug)) continue;
      seen.add(slug);
      games.push({ id: slug, title, cover: "", href });
    }
  }

  return games.slice(0, 40);
});

export const getFitGirlGameDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const slug = data.slug;
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error("Invalid slug");
    const html = await fetchFitGirlHtml(`/${slug}/`);

    const titleMatch =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
      html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
      html.match(/<title>([^<]+)<\/title>/i);
    const title = cleanText(titleMatch?.[1] ?? slug)
      .replace(/\s*[-|–]\s*FitGirl.*$/i, "")
      .replace(/\s*[-|–]\s*Free.*$/i, "")
      .trim();

    const coverMatch =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ??
      html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i);
    const cover = coverMatch?.[1] ?? "";

    // Content block (best-effort — used for description, tags, screenshots).
    const contentMatch =
      html.match(
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i,
      ) ?? html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const contentHtml = contentMatch?.[1] ?? "";

    const description = cleanText(contentHtml).slice(0, 3500);

    const tagMatches = [...contentHtml.matchAll(/rel="tag"[^>]*>([^<]+)<\/a>/gi)];
    const genre =
      tagMatches
        .map((m) => cleanText(m[1] ?? ""))
        .filter(Boolean)
        .slice(0, 4)
        .join(", ") || "PC";

    const yearMatch = (title + " " + description).match(/\b(19[9]\d|20[0-3]\d)\b/);
    const releaseYear = yearMatch ? Number(yearMatch[1]) : null;

    const sizeMatch = description.match(/([\d.,]+\s*GB)/i);
    const sizeGB = sizeMatch?.[1]?.trim() ?? null;

    const torrents: FitGirlTorrent[] = [];
    const torrentHrefMatches = [
      ...html.matchAll(/href="(https?:\/\/[^"'\s<>]+\.torrent(?:\?[^"'\s<>]*)?)"/gi),
    ];
    if (torrentHrefMatches.length > 0) {
      torrents.push({ label: "Torrent file", url: torrentHrefMatches[0]![1]! });
    }
    const magnetMatches = [...html.matchAll(/magnet:\?[^"'\s<>]+/gi)];
    if (magnetMatches.length > 0) {
      torrents.push({ label: "Magnet link", url: magnetMatches[0]![0]! });
    }

    const screenshotUrls = [...contentHtml.matchAll(/<img[^>]+(?:data-src|src)="([^"]+)"/gi)]
      .map((m) => m[1] ?? "")
      .filter((u) => u && !u.startsWith("data:") && u !== cover)
      .slice(0, 6);

    return {
      id: slug,
      title: title || slug,
      cover,
      description,
      genre,
      releaseYear,
      developer: "Unknown",
      publisher: "FitGirl Repacks",
      sizeGB,
      torrents,
      screenshots: screenshotUrls,
      originalUrl: `${FITGIRL_BASE}/${slug}/`,
    } satisfies FitGirlGameDetail;
  });
