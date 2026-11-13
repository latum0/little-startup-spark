import type { FitGirlGameDetail, FitGirlGameSummary, FitGirlTorrent } from "./shared.cjs";

const FITGIRL_BASE = "https://fitgirl-repacks.site";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CATALOG_CACHE_MS = 2 * 60 * 60 * 1000;
const REST_PAGE_SIZE = 100;
const REST_CONCURRENCY = 10;
const MAX_REST_PAGES = 500;

const nonGameSlugs = new Set([
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

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      try {
        return String.fromCodePoint(Number(decimal));
      } catch {
        return "";
      }
    })
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => {
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
    .replace(/&#039;|&apos;/g, "'");
}

function cleanText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*\[\s*FitGirl Repack[^\]]*\]/i, "")
    .replace(/\s*[-–]\s*FitGirl.*$/i, "")
    .trim();
}

function getGameSlug(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.hostname !== "fitgirl-repacks.site") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    const slug = parts[0]!;
    if (
      !/^[a-z0-9][a-z0-9-]*$/i.test(slug) ||
      nonGameSlugs.has(slug.toLowerCase()) ||
      /^\d+(?:-\d+)?$/.test(slug) ||
      /^(upcoming-repacks|updates?-digest|site-news|important)/i.test(slug)
    ) {
      return null;
    }
    return slug;
  } catch {
    return null;
  }
}

function isNonGameTitle(title: string): boolean {
  return /^(upcoming repacks|updates? digest|site news|fitgirl has|fitgirl is|important|faq\b|how to |a guide )/i.test(
    title,
  );
}

async function fetchFitGirl(path: string): Promise<Response> {
  const response = await fetch(`${FITGIRL_BASE}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`FitGirl returned HTTP ${response.status}`);
  return response;
}

function getRestCover(post: Record<string, unknown>): string {
  const embedded = post._embedded as Record<string, unknown> | undefined;
  const media = embedded?.["wp:featuredmedia"];
  const firstMedia = Array.isArray(media) ? (media[0] as Record<string, unknown>) : undefined;
  if (typeof firstMedia?.source_url === "string") return firstMedia.source_url;
  if (typeof post.jetpack_featured_media_url === "string") return post.jetpack_featured_media_url;

  const content = post.content as Record<string, unknown> | undefined;
  const html = typeof content?.rendered === "string" ? content.rendered : "";
  return findContentImage(html);
}

function findContentImage(html: string): string {
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  for (const tag of tags) {
    for (const attribute of ["data-src", "data-lazy-src", "data-original", "src"]) {
      const escaped = attribute.replace("-", "\\-");
      const rawUrl = tag.match(new RegExp(`\\b${escaped}=["']([^"']+)["']`, "i"))?.[1];
      if (!rawUrl) continue;
      const url = decodeHtml(rawUrl).trim();
      if (!/^https?:\/\//i.test(url) || /(?:pixel|spacer|transparent|avatar|1x1)/i.test(url)) {
        continue;
      }
      return url;
    }
  }
  return "";
}

function parseRestPost(value: unknown): FitGirlGameSummary | null {
  if (!value || typeof value !== "object") return null;
  const post = value as Record<string, unknown>;
  const href = typeof post.link === "string" ? post.link : "";
  const id = getGameSlug(href);
  const titleRecord = post.title as Record<string, unknown> | undefined;
  const rawTitle = cleanText(typeof titleRecord?.rendered === "string" ? titleRecord.rendered : "");
  if (!id || !rawTitle || isNonGameTitle(rawTitle)) return null;
  return { id, title: cleanTitle(rawTitle) || rawTitle, cover: getRestCover(post), href };
}

export class FitGirlCatalog {
  private cachedCatalog: { games: FitGirlGameSummary[]; fetchedAt: number } | null = null;
  private refreshingCatalog = false;

  async getCatalog(): Promise<FitGirlGameSummary[]> {
    if (this.cachedCatalog && Date.now() - this.cachedCatalog.fetchedAt < CATALOG_CACHE_MS) {
      return this.cachedCatalog.games;
    }
    if (this.refreshingCatalog && this.cachedCatalog) return this.cachedCatalog.games;

    // Return the newest 100 games immediately. Build the rest in the background so
    // opening Explore never waits for dozens of WordPress API pages.
    const response = await fetchFitGirl(
      `/wp-json/wp/v2/posts?per_page=${REST_PAGE_SIZE}&page=1&_embed=1`,
    );
    const firstPage = (await response.json()) as unknown;
    const initialGames = Array.isArray(firstPage)
      ? firstPage.map(parseRestPost).filter((game): game is FitGirlGameSummary => Boolean(game))
      : [];
    if (initialGames.length === 0) {
      throw new Error("FitGirl's catalog API returned no games. The site may be unavailable.");
    }
    const games = new Map(initialGames.map((game) => [game.id, game]));
    this.cachedCatalog = { games: [...games.values()], fetchedAt: Date.now() };
    const totalPages = Math.min(
      MAX_REST_PAGES,
      Math.max(1, Number(response.headers.get("X-WP-TotalPages")) || 1),
    );
    if (totalPages > 1) {
      this.refreshingCatalog = true;
      void (async () => {
        try {
          for (let first = 2; first <= totalPages; first += REST_CONCURRENCY) {
            const pages = Array.from(
              { length: Math.min(REST_CONCURRENCY, totalPages - first + 1) },
              (_, i) => first + i,
            );
            const results = await Promise.all(
              pages.map(async (page) => {
                try {
                  const pageResponse = await fetchFitGirl(
                    `/wp-json/wp/v2/posts?per_page=${REST_PAGE_SIZE}&page=${page}&_embed=1`,
                  );
                  return (await pageResponse.json()) as unknown;
                } catch {
                  return null;
                }
              }),
            );
            for (const result of results)
              if (Array.isArray(result))
                for (const post of result) {
                  const game = parseRestPost(post);
                  if (game) games.set(game.id, game);
                }
            this.cachedCatalog = { games: [...games.values()], fetchedAt: Date.now() };
            if (games.size >= 50_000) break;
          }
        } finally {
          this.refreshingCatalog = false;
          this.cachedCatalog = { games: [...games.values()], fetchedAt: Date.now() };
        }
      })();
    }
    return this.cachedCatalog.games;
  }

  async getGameDetail(slug: string): Promise<FitGirlGameDetail> {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error("Invalid game slug");
    const response = await fetchFitGirl(`/${slug}/`);
    const html = await response.text();
    const titleMatch =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
      html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
      html.match(/<title>([^<]+)<\/title>/i);
    const title = cleanText(titleMatch?.[1] ?? slug)
      .replace(/\s*[-|–]\s*FitGirl.*$/i, "")
      .replace(/\s*[-|–]\s*Free.*$/i, "")
      .trim();
    const metaCover =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ??
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1] ??
      html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)?.[1] ??
      html.match(/<meta[^>]+content="([^"]+)"[^>]+name="twitter:image"/i)?.[1] ??
      "";
    const contentHtml =
      html.match(
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i,
      )?.[1] ??
      html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
      "";
    let cover = decodeHtml(metaCover) || findContentImage(contentHtml) || findContentImage(html);
    if (!cover) {
      try {
        const response = await fetchFitGirl(
          `/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`,
        );
        const posts = (await response.json()) as unknown;
        if (Array.isArray(posts) && posts[0]) {
          const summary = parseRestPost(posts[0]);
          if (summary?.cover) cover = summary.cover;
        }
      } catch {
        // The page image is optional; keep loading the game details if the media API is down.
      }
    }
    const description = cleanText(contentHtml).slice(0, 3500);
    const genre =
      [...contentHtml.matchAll(/rel="tag"[^>]*>([^<]+)<\/a>/gi)]
        .map((match) => cleanText(match[1] ?? ""))
        .filter(Boolean)
        .slice(0, 4)
        .join(", ") || "PC";
    const year = (title + " " + description).match(/\b(19[9]\d|20[0-3]\d)\b/)?.[1];
    const sizeGB = description.match(/([\d.,]+\s*GB)/i)?.[1]?.trim() ?? null;

    const torrents: FitGirlTorrent[] = [];
    const torrentFile = html.match(
      /href="(https?:\/\/[^"'\s<>]+\.torrent(?:\?[^"'\s<>]*)?)"/i,
    )?.[1];
    if (torrentFile) torrents.push({ label: "Torrent file", url: decodeHtml(torrentFile) });
    const magnetLink = html.match(/magnet:\?[^"'\s<>]+/i)?.[0];
    if (magnetLink) torrents.push({ label: "Magnet link", url: decodeHtml(magnetLink) });
    const screenshots = [...contentHtml.matchAll(/<img[^>]+(?:data-src|src)="([^"]+)"/gi)]
      .map((match) => match[1] ?? "")
      .filter((url) => url && !url.startsWith("data:") && url !== cover)
      .slice(0, 6);

    return {
      id: slug,
      title: title || slug,
      cover,
      description,
      genre,
      releaseYear: year ? Number(year) : null,
      developer: "Unknown",
      publisher: "FitGirl Repacks",
      sizeGB,
      torrents,
      screenshots,
      originalUrl: `${FITGIRL_BASE}/${slug}/`,
    };
  }
}
