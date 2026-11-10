import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gameProviders, type CatalogGame } from "@/providers/catalog";

const ITEMS_PER_PAGE = 24;

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
  const [providerId, setProviderId] = useState(gameProviders[0]?.id ?? "demo");
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const provider = gameProviders.find((item) => item.id === providerId) ?? gameProviders[0]!;

  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAddedIds(new Set());
    setPage(1);
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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return games;
    return games.filter((game) =>
      `${game.title} ${game.genre} ${game.developer}`.toLowerCase().includes(query),
    );
  }, [q, games]);

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
            {gameProviders.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
          const isInternal = game.href.startsWith("/");
          const card: ReactNode = (
            <>
              <div className="aspect-video overflow-hidden bg-secondary">
                {game.cover ? (
                  <img
                    src={game.cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No cover
                  </div>
                )}
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
              {isInternal ? (
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