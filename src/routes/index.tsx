import { createFileRoute, Link } from "@tanstack/react-router";
import { Gamepad2, Info, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameRow } from "@/components/carousels/GameRow";
import { featuredGameId, games, getGame, installedGames, recentlyAddedIds } from "@/data/mockGames";
import type { LibraryGame } from "../../electron/shared.cjs";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home · NEXUS" },
      {
        name: "description",
        content: "Your NEXUS home: featured games, continue playing and new arrivals.",
      },
      { property: "og:title", content: "Home · NEXUS" },
      { property: "og:description", content: "Featured games, continue playing and new arrivals." },
    ],
  }),
  component: Home,
});

function Home() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);
  return isDesktop ? <DesktopHomePage /> : <MockHomePage />;
}

function MockHomePage() {
  const f = getGame(featuredGameId)!;
  const continuePlaying = installedGames.map((i) => getGame(i.gameId)!);
  const lastPlayed = Object.fromEntries(
    installedGames.map((i) => [i.gameId, `Played ${i.lastPlayed}`]),
  );
  const popular = [...games].sort((a, b) => b.popularity - a.popularity);
  const recent = recentlyAddedIds.map((id) => getGame(id)!);
  return (
    <div className="pb-16">
      <section className="relative h-[620px]">
        <img
          src={f.cover}
          alt={f.title}
          width={1600}
          height={912}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 scrim-left" />
        <div className="absolute inset-0 scrim-bottom" />
        <div className="relative flex h-full max-w-xl flex-col justify-end px-12 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold tracking-[0.3em] text-primary uppercase">Featured</p>
          <h1 className="mt-3 font-display text-6xl font-bold leading-none">{f.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {f.genre} · {f.releaseYear}
          </p>
          <p className="mt-3 text-base text-foreground/85">{f.description}</p>
          <div className="mt-8 flex gap-3">
            <Button size="lg" className="rounded-full px-8">
              <Play className="fill-current" /> Play
            </Button>
            <Button size="lg" variant="secondary" className="rounded-full px-6" asChild>
              <Link to="/games/$id" params={{ id: f.id }}>
                <Info /> Details
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <div className="px-12">
        <GameRow title="Continue playing" games={continuePlaying} subtitles={lastPlayed} />
        <GameRow title="Popular" games={popular} />
        <GameRow title="Recently added" games={recent} />
      </div>
    </div>
  );
}

function DesktopHomePage() {
  const [library, setLibrary] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window
      .nexus!.getLibrary()
      .then(setLibrary)
      .catch(() => toast.error("Could not load your library"))
      .finally(() => setLoading(false));
  }, []);

  const featured = library.find((game) => game.executablePath) ?? library[0];
  const launch = async (game: LibraryGame) => {
    try {
      await window.nexus!.launchGame(game.id);
      toast.success(`Launched ${game.title}`);
    } catch {
      toast.error(`Could not launch ${game.title}`);
    }
  };

  return (
    <div className="pb-16">
      <section className="relative h-[620px] overflow-hidden bg-gradient-to-br from-primary/25 via-card to-background">
        {featured?.cover ? (
          <img
            src={featured.cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 scrim-left" />
        <div className="absolute inset-0 scrim-bottom" />
        <div className="relative flex h-full max-w-xl flex-col justify-end px-12 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold tracking-[0.3em] text-primary uppercase">
            Your library
          </p>
          <h1 className="mt-3 font-display text-6xl font-bold leading-none">
            {loading ? "Loading…" : (featured?.title ?? "Welcome to NEXUS")}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {featured
              ? [featured.genre, featured.developer].filter(Boolean).join(" · ")
              : "Your games, ready when you are."}
          </p>
          <p className="mt-3 text-base text-foreground/85">
            {featured?.description ||
              (library.length
                ? "Choose an executable in your library to launch this game."
                : "Add a game you already own, or explore game information from a provider.")}
          </p>
          <div className="mt-8 flex gap-3">
            {featured?.executablePath ? (
              <Button size="lg" className="rounded-full px-8" onClick={() => void launch(featured)}>
                <Play className="fill-current" />
                Play
              </Button>
            ) : (
              <Button size="lg" variant="secondary" className="rounded-full px-6" asChild>
                <Link to="/library">
                  <Gamepad2 />
                  Set up a game
                </Link>
              </Button>
            )}
            <Button size="lg" variant="secondary" className="rounded-full px-6" asChild>
              <Link to="/explore">
                <Info />
                Explore
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <div className="px-12">
        {library.length ? (
          <DesktopGameRow title="Your games" games={library} onLaunch={launch} />
        ) : (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8">
            <h2 className="font-display text-xl font-semibold">Your library is ready</h2>
            <p className="mt-2 text-muted-foreground">
              Add an installed game or add game information from the provider catalog.
            </p>
            <div className="mt-5 flex gap-3">
              <Button className="rounded-full" asChild>
                <Link to="/library">Open library</Link>
              </Button>
              <Button variant="secondary" className="rounded-full" asChild>
                <Link to="/explore">Browse games</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopGameRow({
  title,
  games: rowGames,
  onLaunch,
}: {
  title: string;
  games: LibraryGame[];
  onLaunch: (game: LibraryGame) => void;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
      <div className="no-scrollbar -mx-2 flex gap-5 overflow-x-auto px-2 py-3">
        {rowGames.map((game) => (
          <button
            key={game.id}
            onClick={() => game.executablePath && onLaunch(game)}
            disabled={!game.executablePath}
            className="group w-48 shrink-0 text-left outline-none disabled:cursor-default"
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 group-hover:-translate-y-1 group-hover:focus-glow">
              {game.cover ? (
                <img
                  src={game.cover}
                  alt={game.title}
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <div className="grid aspect-[3/4] place-items-center bg-gradient-to-br from-primary/35 via-secondary to-background">
                  <Gamepad2 className="size-10 text-primary/80" />
                </div>
              )}
            </div>
            <p className="mt-3 font-display text-sm font-semibold">{game.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {game.executablePath ? "Click to play" : "Set executable in Library"}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
