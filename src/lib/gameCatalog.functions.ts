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

const REST_PER_PAGE = 100; // WP REST API max
const REST_CONCURRENCY = 15;
const REST_MAX_PAGES = 500; // safety cap (500 * 100 = 50,000 posts)

const HTML_CONCURRENCY = 20;
const HTML_MAX_PAGES = 900;

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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

const NON_GAME_TITLE_PATTERNS: RegExp[] = [
  /^upcoming repacks/i,
  /^updates? digest/i,
  /^site news/i,
  /^fitgirl has/i,
  /^fitgirl is/i,
  /^important/i,
  /^faq\b/i,
  /^how to /i,
  /^a guide /i,
];

const NON_GAME_SLUG_PATTERNS: RegExp[] = [
  /^upcoming-repacks/i,
  /^updates?-digest/i,
  /^site-news/i,
  /^important/i,
];

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

/* ──────────────────────────── helpers ──────────────────────────── */

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as unknown as { any?: unknown }).any === "function") {
    return (
      AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }
    ).any(signals);
  }
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(Number(dec));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanText(s: string): string {
  return decodeHtmlEntities(
    s
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*\[\s*FitGirl Repack[^\]]*\]/i, "")
    .replace(/\s*[-–]\s*FitGirl.*$/i, "")
    .trim();
}

function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("fitgirl-repacks.site")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    const slug = parts[0]!;
    if (!slug || NON_GAME_SLUGS.has(slug.toLowerCase())) return null;
    if (/^\d+(?:-\d+)?$/.test(slug)) return null;
    if (NON_GAME_SLUG_PATTERNS.some((re) => re.test(slug))) return null;
    return slug;
  } catch {
    return null;
  }
}

function isNonGameTitle(title: string): boolean {
  return NON_GAME_TITLE_PATTERNS.some((re) => re.test(title));
}

/* ─────────────────────── HTML page parser ─────────────────────── */

function parsePageArticles(html: string): FitGirlGameSummary[] {
  const games: FitGirlGameSummary[] = [];
  const seen = new Set<string>();

  const articleBlocks = html.match(/<article[\s\S]*?<\/article>/gi) ?? [];
  for (const block of articleBlocks) {
    const titleMatch = block.match(
      /<h[1-3][^>]*>\s*<a[^>]+href="(https?:\/\/fitgirl-repacks\.site\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-3]>/i,
    );
    if (!titleMatch) continue;
    const href = titleMatch[1] ?? "";
    const rawTitle = cleanText(titleMatch[2] ?? "");
    const slug = extractSlug(href);
    if (!slug || !rawTitle || seen.has(slug)) continue;
    if (isNonGameTitle(rawTitle)) continue;
    seen.add(slug);

    const imgMatch = block.match(
      /<img[^>]+(?:data-src|data-lazy-src|data-original|src)="([^"]+)"/i,
    );
    let cover = imgMatch?.[1] ?? "";
    if (cover.startsWith("data:")) cover = "";

    games.push({
      id: slug,
      title: cleanTitle(rawTitle) || rawTitle,
      cover,
      href,
    });
  }

  if (games.length === 0) {
    const headingRegex =
      /<h[1-3][^>]*>\s*<a[^>]+href="(https?:\/\/fitgirl-repacks\.site\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-3]>/gi;
    let m: RegExpExecArray | null;
    while ((m = headingRegex.exec(html)) !== null) {
      const href = m[1] ?? "";
      const rawTitle = cleanText(m[2] ?? "");
      const slug = extractSlug(href);
      if (!slug || !rawTitle || seen.has(slug)) continue;
      if (isNonGameTitle(rawTitle)) continue;
      seen.add(slug);
      games.push({
        id: slug,
        title: cleanTitle(rawTitle) || rawTitle,
        cover: "",
        href,
      });
    }
  }

  return games;
}

async function fetchFitGirlHtml(path: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${FITGIRL_BASE}${path}`, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: combineSignals(signal, AbortSignal.timeout(20000)),
  });
  if (!response.ok) throw new Error(`FitGirl returned HTTP ${response.status}`);
  return response.text();
}

/* ────────────────── Fast path: WP REST API ────────────────── */

async function scrapeViaRestApi(
  collected: Map<string, FitGirlGameSummary>,
  signal: AbortSignal,
): Promise<number> {
  let totalPages = REST_MAX_PAGES;
  try {
    const probe = await fetch(`${FITGIRL_BASE}/wp-json/wp/v2/posts?per_page=1`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: combineSignals(signal, AbortSignal.timeout(10000)),
    });
    if (!probe.ok) throw new Error(`probe HTTP ${probe.status}`);
    const tp = Number(probe.headers.get("X-WP-TotalPages"));
    const tot = Number(probe.headers.get("X-WP-Total"));
    if (Number.isFinite(tp) && tp > 0) {
      totalPages = Math.min(tp, REST_MAX_PAGES);
    } else if (Number.isFinite(tot) && tot > 0) {
      totalPages = Math.min(Math.ceil(tot / REST_PER_PAGE), REST_MAX_PAGES);
    }
  } catch (err) {
    throw new Error(`FitGirl REST API unavailable: ${(err as Error).message}`);
  }

  let added = 0;
  let page = 1;
  let consecutiveFails = 0;

  while (page <= totalPages) {
    if (signal.aborted) return added;

    const batch = Array.from(
      { length: Math.min(REST_CONCURRENCY, totalPages - page + 1) },
      (_, i) => page + i,
    );

    const results = await Promise.all(
      batch.map(async (n) => {
        try {
          const response = await fetch(
            `${FITGIRL_BASE}/wp-json/wp/v2/posts?per_page=${REST_PER_PAGE}&page=${n}&_embed=1`,
            {
              headers: { "User-Agent": BROWSER_UA },
              signal: combineSignals(signal, AbortSignal.timeout(25000)),
            },
          );
          if (!response.ok) {
            if (response.status === 400) {
              try {
                const body = (await response.json()) as { code?: string };
                if (body?.code === "rest_post_invalid_page_number") return [];
              } catch {
                /* ignore */
              }
            }
            return null;
          }
          const data: unknown = await response.json();
          return Array.isArray(data) ? data : null;
        } catch {
          return null;
        }
      }),
    );

    const successes = results.filter((r) => r !== null).length;
    if (successes === 0) {
      consecutiveFails++;
      if (consecutiveFails >= 2) break;
    } else {
      consecutiveFails = 0;
    }

    for (const posts of results) {
      if (!Array.isArray(posts)) continue;
      for (const rawPost of posts) {
        if (!rawPost || typeof rawPost !== "object") continue;
        const post = rawPost as Record<string, unknown>;
        const href = typeof post.link === "string" ? post.link : "";
        const slug = extractSlug(href);
        if (!slug || collected.has(slug)) continue;

        const titleObj = post.title as Record<string, unknown> | undefined;
        const rawTitle = cleanText(
          typeof titleObj?.rendered === "string" ? titleObj.rendered : "",
        );
        if (!rawTitle || isNonGameTitle(rawTitle)) continue;

        let cover = "";
        const embedded = post._embedded as Record<string, unknown> | undefined;
        const fmArr = embedded?.["wp:featuredmedia"];
        const fmFirst = Array.isArray(fmArr)
          ? (fmArr[0] as Record<string, unknown> | undefined)
          : undefined;

        if (typeof fmFirst?.source_url === "string") {
          cover = fmFirst.source_url;
        } else if (typeof post.jetpack_featured_media_url === "string") {
          cover = post.jetpack_featured_media_url;
        }

        // Fallback: if featured media isn't provided, dig into the post content for the first image.
        if (!cover) {
          const contentObj = post.content as Record<string, unknown> | undefined;
          const contentRendered =
            typeof contentObj?.rendered === "string" ? contentObj.rendered : "";
          const imgMatch = contentRendered.match(
            /<img[^>]+(?:data-src|data-lazy-src|data-original|src)="([^"]+)"/i,
          );
          if (imgMatch && imgMatch[1] && !imgMatch[1].startsWith("data:")) {
            cover = imgMatch[1];
          }
        }

        collected.set(slug, {
          id: slug,
          title: cleanTitle(rawTitle) || rawTitle,
          cover,
          href,
        });
        added++;
      }
    }

    page += batch.length;
  }

  return added;
}

/* ─────────────── Slow path: HTML archive pagination ─────────────── */

async function scrapeViaHtmlPages(
  collected: Map<string, FitGirlGameSummary>,
  signal: AbortSignal,
): Promise<number> {
  let added = 0;
  let page = 1;
  let emptyBatches = 0;

  while (page <= HTML_MAX_PAGES && emptyBatches < 2) {
    if (signal.aborted) return added;

    const batch = Array.from(
      { length: Math.min(HTML_CONCURRENCY, HTML_MAX_PAGES - page + 1) },
      (_, i) => page + i,
    );

    const results = await Promise.all(
      batch.map(async (n) => {
        try {
          const html = await fetchFitGirlHtml(n === 1 ? "/" : `/page/${n}/`, signal);
          return parsePageArticles(html);
        } catch {
          return [] as FitGirlGameSummary[];
        }
      }),
    );

    let batchAdded = 0;
    for (const games of results) {
      for (const g of games) {
        if (!collected.has(g.id)) {
          collected.set(g.id, g);
          batchAdded++;
          added++;
        }
      }
    }

    if (batchAdded === 0) emptyBatches++;
    else emptyBatches = 0;

    page += batch.length;
  }

  return added;
}

/* ─────────────────── Orchestrator + cache ─────────────────── */

async function scrapeAllGames(): Promise<FitGirlGameSummary[]> {
  const collected = new Map<string, FitGirlGameSummary>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000); // 90s hard cap
  const startedAt = Date.now();

  try {
    try {
      const viaRest = await scrapeViaRestApi(collected, controller.signal);
      console.log(
        `[fitgirl] REST API added ${viaRest} games (${collected.size} unique so far)`,
      );
    } catch (err) {
      console.warn(
        `[fitgirl] REST API failed, falling back to HTML: ${(err as Error).message}`,
      );
    }

    if (collected.size < 100) {
      const viaHtml = await scrapeViaHtmlPages(collected, controller.signal);
      console.log(`[fitgirl] HTML fallback added ${viaHtml} games`);
    }

    console.log(
      `[fitgirl] scraped ${collected.size} games in ${Date.now() - startedAt}ms`,
    );
  } finally {
    clearTimeout(timer);
  }

  return Array.from(collected.values());
}

interface CachedCatalog {
  games: FitGirlGameSummary[];
  fetchedAt: number;
}

let cachedGames: CachedCatalog | null = null;
let scrapingPromise: Promise<FitGirlGameSummary[]> | null = null;

async function getOrScrapeCatalog(): Promise<FitGirlGameSummary[]> {
  if (cachedGames && Date.now() - cachedGames.fetchedAt < CACHE_TTL_MS) {
    return cachedGames.games;
  }
  if (scrapingPromise) return scrapingPromise;

  scrapingPromise = scrapeAllGames()
    .then((games) => {
      if (games.length >= 100) {
        cachedGames = { games, fetchedAt: Date.now() };
      }
      return games;
    })
    .finally(() => {
      scrapingPromise = null;
    });
  return scrapingPromise;
}

export const getFitGirlCatalog = createServerFn({ method: "GET" }).handler(async () => {
  return getOrScrapeCatalog();
});

/* ─────────────────────────── Detail page ─────────────────────────── */

export const getFitGirlGameDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const slug = data.slug;
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error("Invalid slug");

    const controller = new AbortController();
    const html = await fetchFitGirlHtml(`/${slug}/`, controller.signal);

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