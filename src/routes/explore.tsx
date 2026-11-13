import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gameProviders, type CatalogGame } from "@/providers/catalog";

const ITEMS_PER_PAGE = 24;
const GOTY_WINNERS = new Set([
  "the witcher 3 wild hunt",
  "overwatch",
  "the legend of zelda breath of the wild",
  "god of war",
  "sekiro shadows die twice",
  "the last of us part ii",
  "it takes two",
  "elden ring",
  "baldur s gate 3",
  "astro bot",
]);

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore · NEXUS" },
      { name: "description", content: "Discover new games by category, genre and popularity." },
      { property: "og:title", content: "Explore · NEXUS" },
      { property: "og:description", content: "Discover new games on NEXUS." },
    ],
  }),
  component: Explore,
});

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

function Explore() {
  const [q, setQ] = useState("");
  const [providerId, setProviderId] = useState("fitgirl");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const [selectedGame, setSelectedGame] = useState<CatalogGame | null>(null);
  const [fitGirlMatch, setFitGirlMatch] = useState<CatalogGame | null>(null);
  const [checkingFitGirl, setCheckingFitGirl] = useState(false);
  const availableProviders = gameProviders.filter(
    (item) => item.id !== "steam-recommendations" || isDesktop,
  );
  const provider =
    availableProviders.find((item) => item.id === providerId) ?? availableProviders[0]!;
  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...games.map((game) => game.recommendationCategory).filter(Boolean),
          ...(providerId === "steam-recommendations" ? ["GOTY winners"] : []),
        ]),
      ] as string[],
    [games, providerId],
  );
  const genres = useMemo(
    () => [...new Set(games.map((game) => game.genre).filter(Boolean))].sort(),
    [games],
  );

  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);

  useEffect(() => {
    let active = true;
    if (!selectedGame || providerId !== "steam-recommendations") {
      setFitGirlMatch(null);
      return;
    }
    setCheckingFitGirl(true);
    void gameProviders
      .find((item) => item.id === "fitgirl")!
      .getGames()
      .then((catalog) => {
        const normalize = (value: string) =>
          value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
        const wanted = normalize(selectedGame.title);
        const match = catalog.find((game) => normalize(game.title) === wanted) ?? null;
        if (active) setFitGirlMatch(match);
      })
      .catch(() => {
        if (active) setFitGirlMatch(null);
      })
      .finally(() => {
        if (active) setCheckingFitGirl(false);
      });
    return () => {
      active = false;
    };
  }, [selectedGame, providerId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAddedIds(new Set());
    setPage(1);
    setCategoryFilter("all");
    setGenreFilter("all");
    provider
      .getGames()
      .then((items) => {
        if (active) setGames(items);
      })
      .catch(() => {
        if (active) {
          setGames([]);
          setError(`Could not load games from ${provider.name}. Please try again.`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider]);

  useEffect(() => {
    if (!isDesktop || providerId !== "fitgirl" || loading || error) return;
    const timer = window.setInterval(() => {
      void provider
        .getGames()
        .then((items) => {
          setGames((current) => (items.length > current.length ? items : current));
        })
        .catch(() => undefined);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [isDesktop, providerId, loading, error, provider]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return games.filter((game) => {
      const matchesQuery =
        !query || `${game.title} ${game.genre} ${game.developer}`.toLowerCase().includes(query);
      const normalizedTitle = game.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "GOTY winners"
          ? GOTY_WINNERS.has(normalizedTitle)
          : game.recommendationCategory === categoryFilter);
      const matchesGenre = genreFilter === "all" || game.genre === genreFilter;
      return matchesQuery && matchesCategory && matchesGenre;
    });
  }, [q, games, categoryFilter, genreFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const goToPage = (n: number) => {
    setPage(Math.max(1, Math.min(n, totalPages)));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const shownStart = filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const shownEnd = Math.min(currentPage * ITEMS_PER_PAGE, filtered.length);

  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Explore</h1>
      <p className="mt-2 text-muted-foreground">
        Browse game information from a provider you choose.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Select
          value={providerId}
          onValueChange={(v) => {
            setProviderId(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Game information provider" className="w-56 rounded-full">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {categories.length > 0 && (
          <Select
            value={categoryFilter}
            onValueChange={(value) => {
              setCategoryFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Recommendation category" className="w-48 rounded-full">
              <SelectValue placeholder="Recommendation category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All recommendations</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category!}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {genres.length > 1 && (
          <Select
            value={genreFilter}
            onValueChange={(value) => {
              setGenreFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by genre" className="w-44 rounded-full">
              <SelectValue placeholder="All genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genres</SelectItem>
              {genres.map((genre) => (
                <SelectItem key={genre} value={genre}>
                  {genre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <label className="flex w-72 items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search games"
            className="w-full bg-transparent outline-none"
          />
        </label>

        {!loading && !error && filtered.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Showing {shownStart.toLocaleString()}–{shownEnd.toLocaleString()} of{" "}
            {filtered.length.toLocaleString()} game{filtered.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-8 grid grid-cols-4 gap-6">
        {pageItems.map((game) => {
          const isSteamRecommendation = providerId === "steam-recommendations";
          const card: ReactNode = (
            <>
              <div className="aspect-video overflow-hidden bg-secondary">
                <CatalogCover game={game} />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display font-semibold">{game.title}</h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {game.releaseYear ?? "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-primary">{game.genre}</p>
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                  {game.description || "Open to see details."}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {game.developer} · {game.publisher}
                </p>
              </div>
            </>
          );

          return (
            <div
              key={game.id}
              className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50"
            >
              {isSteamRecommendation ? (
                <button
                  type="button"
                  onClick={() => setSelectedGame(game)}
                  className="group block w-full text-left"
                >
                  {card}
                </button>
              ) : game.href.startsWith("/") ? (
                <Link to={game.href as never} className="group block">
                  {card}
                </Link>
              ) : (
                <a href={game.href} target="_blank" rel="noreferrer" className="group block">
                  {card}
                </a>
              )}
              {isDesktop && game.sourceId !== undefined && (
                <div className="px-4 pb-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full rounded-full"
                    disabled={addedIds.has(game.sourceId)}
                    onClick={async () => {
                      try {
                        await window.nexus?.addMetadataGame(game.sourceId!);
                        setAddedIds((current) => new Set(current).add(game.sourceId!));
                        toast.success(`${game.title} added to your library`);
                      } catch {
                        toast.error(`Could not add ${game.title} to your library`);
                      }
                    }}
                  >
                    {addedIds.has(game.sourceId) ? "In library" : "Add to library"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(selectedGame)} onOpenChange={(open) => !open && setSelectedGame(null)}>
        <DialogContent className="max-w-3xl">
          {selectedGame && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedGame.title}</DialogTitle>
                <DialogDescription>
                  {selectedGame.genre} · {selectedGame.developer}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 md:grid-cols-[260px_1fr]">
                {selectedGame.cover && (
                  <img src={selectedGame.cover} alt="" className="w-full rounded-xl object-cover" />
                )}
                <div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedGame.description}
                  </p>
                  <div className="mt-6 rounded-xl border border-border bg-card p-4">
                    <p className="font-semibold">FitGirl availability</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {checkingFitGirl
                        ? "Checking the FitGirl catalog…"
                        : fitGirlMatch
                          ? "This game is listed in the FitGirl catalog."
                          : "This game was not found in the FitGirl catalog."}
                    </p>
                    {fitGirlMatch && (
                      <Button className="mt-4" asChild>
                        <Link to={fitGirlMatch.href as never}>Open in-app download page</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {loading && (
        <p className="mt-16 text-center text-muted-foreground">
          Loading games… (large catalogs may take a moment on first visit)
        </p>
      )}
      {!loading && error && (
        <p role="alert" className="mt-16 text-center text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="mt-16 text-center text-muted-foreground">No games match your search.</p>
      )}

      {!loading && !error && totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-12 flex flex-wrap items-center justify-center gap-2"
        >
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft /> Previous
          </Button>

          {getPageNumbers(currentPage, totalPages).map((n, idx) =>
            n === "..." ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-2 text-sm text-muted-foreground"
                aria-hidden
              >
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === currentPage ? "default" : "secondary"}
                size="sm"
                className="min-w-9 rounded-full"
                onClick={() => goToPage(n)}
                aria-current={n === currentPage ? "page" : undefined}
              >
                {n}
              </Button>
            ),
          )}

          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <ChevronRight />
          </Button>
        </nav>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Game information provided by{" "}
        <a
          className="underline hover:text-foreground"
          href={provider.attribution.href}
          target={providerId === "demo" ? undefined : "_blank"}
          rel={providerId === "demo" ? undefined : "noreferrer"}
        >
          {provider.attribution.label}
        </a>
        .
      </p>
    </div>
  );
}

function CatalogCover({ game }: { game: CatalogGame }) {
  const [cover, setCover] = useState(game.cover);
  const [lookedUp, setLookedUp] = useState(false);
  const imageClass =
    "h-full w-full object-cover transition-transform duration-300 group-hover:scale-105";

  useEffect(() => {
    setCover(game.cover);
    setLookedUp(false);
  }, [game.id, game.cover]);

  const findCover = useCallback(async () => {
    if (lookedUp || !game.slug || !window.nexus) return;
    setLookedUp(true);
    try {
      const detail = await window.nexus.getFitGirlGameDetail(game.slug);
      if (detail.cover && detail.cover !== cover) setCover(detail.cover);
    } catch {
      // Keep the card placeholder if the detail page has no usable artwork.
    }
  }, [lookedUp, game.slug, cover]);

  useEffect(() => {
    if (!game.cover && game.slug) void findCover();
  }, [game.id, game.cover, game.slug, findCover]);

  if (!cover) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {lookedUp ? "Loading cover…" : "No cover"}
      </div>
    );
  }

  return (
    <img
      src={cover}
      alt=""
      loading="lazy"
      className={imageClass}
      onError={() => void findCover()}
    />
  );
}
