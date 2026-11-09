import { createFileRoute, Link } from "@tanstack/react-router";
import { Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameRow } from "@/components/carousels/GameRow";
import { featuredGameId, games, getGame, installedGames, recentlyAddedIds } from "@/data/mockGames";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home · NEXUS" },
      { name: "description", content: "Your NEXUS home: featured games, continue playing and new arrivals." },
      { property: "og:title", content: "Home · NEXUS" },
      { property: "og:description", content: "Featured games, continue playing and new arrivals." },
    ],
  }),
  component: Home,
});

function Home() {
  const f = getGame(featuredGameId)!;
  const continuePlaying = installedGames.map((i) => getGame(i.gameId)!);
  const lastPlayed = Object.fromEntries(installedGames.map((i) => [i.gameId, `Played ${i.lastPlayed}`]));
  const popular = [...games].sort((a, b) => b.popularity - a.popularity);
  const recent = recentlyAddedIds.map((id) => getGame(id)!);
  return (
    <div className="pb-16">
      <section className="relative h-[620px]">
        <img src={f.cover} alt={f.title} width={1600} height={912} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 scrim-left" />
        <div className="absolute inset-0 scrim-bottom" />
        <div className="relative flex h-full max-w-xl flex-col justify-end px-12 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold tracking-[0.3em] text-primary uppercase">Featured</p>
          <h1 className="mt-3 font-display text-6xl font-bold leading-none">{f.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{f.genre} · {f.releaseYear}</p>
          <p className="mt-3 text-base text-foreground/85">{f.description}</p>
          <div className="mt-8 flex gap-3">
            <Button size="lg" className="rounded-full px-8"><Play className="fill-current" /> Play</Button>
            <Button size="lg" variant="secondary" className="rounded-full px-6" asChild>
              <Link to="/games/$id" params={{ id: f.id }}><Info /> Details</Link>
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
