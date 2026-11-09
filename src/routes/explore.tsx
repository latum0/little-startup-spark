import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

function Explore() {
  const [q, setQ] = useState("");
  const [providerId, setProviderId] = useState(gameProviders[0]?.id ?? "demo");
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(() => new Set());
  const provider = gameProviders.find((item) => item.id === providerId) ?? gameProviders[0]!;

  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAddedIds(new Set());
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

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return games.filter((game) =>
      `${game.title} ${game.genre} ${game.developer}`.toLowerCase().includes(query),
    );
  }, [q, games]);

  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Explore</h1>
      <p className="mt-2 text-muted-foreground">
        Browse game information from a provider you choose.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Select value={providerId} onValueChange={setProviderId}>
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
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search games"
            className="w-full bg-transparent outline-none"
          />
        </label>
      </div>
      <div className="mt-8 grid grid-cols-4 gap-6">
        {list.map((game) => (
          <div
            key={game.id}
            className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50"
          >
            <a
              href={game.href}
              target={providerId === "demo" ? undefined : "_blank"}
              rel={providerId === "demo" ? undefined : "noreferrer"}
              className="group block"
            >
              <div className="aspect-video overflow-hidden bg-secondary">
                <img
                  src={game.cover}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
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
                  {game.description}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {game.developer} · {game.publisher}
                </p>
              </div>
            </a>
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
        ))}
      </div>
      {loading && <p className="mt-16 text-center text-muted-foreground">Loading games…</p>}
      {!loading && error && (
        <p role="alert" className="mt-16 text-center text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && list.length === 0 && (
        <p className="mt-16 text-center text-muted-foreground">No games match your search.</p>
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
