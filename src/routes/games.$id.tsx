import { createFileRoute, notFound } from "@tanstack/react-router";
import { Ban, Download, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getGame } from "@/data/mockGames";
import type { GameStatus } from "@/types/game";

export const Route = createFileRoute("/games/$id")({
  loader: ({ params }) => {
    const game = getGame(params.id);
    if (!game) throw notFound();
    return { game };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.game.title} · NEXUS` : "Game not found · NEXUS" },
      { name: "description", content: loaderData?.game.tagline ?? "Game details" },
      { property: "og:title", content: loaderData?.game.title ?? "NEXUS" },
      { property: "og:description", content: loaderData?.game.tagline ?? "Game details" },
    ],
  }),
  component: GameDetails,
});

function GameDetails() {
  const { game } = Route.useLoaderData();
  const [status, setStatus] = useState<GameStatus | "downloading">(game.status);
  const [shot, setShot] = useState<string | null>(null);

  const action = {
    installed: { label: "Play", icon: Play, onClick: () => toast(`Launching ${game.title}… (demo)`) },
    available: { label: "Download", icon: Download, onClick: () => { setStatus("downloading"); toast(`${game.title} added to downloads (demo)`); } },
    downloading: { label: "Downloading…", icon: Download, onClick: () => {} },
    unavailable: { label: "Unavailable", icon: Ban, onClick: () => {} },
  }[status];

  const facts = [["Genre", game.genre], ["Release date", game.releaseDate], ["Developer", game.developer], ["Publisher", game.publisher], ["Size", `${game.sizeGB} GB`]];

  return (
    <div className="pb-16">
      <section className="relative h-[560px]">
        <img src={game.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 scrim-left" />
        <div className="absolute inset-0 scrim-bottom" />
        <div className="relative flex h-full items-end gap-8 px-12 pb-12">
          <img src={game.cover} alt={game.title} className="aspect-[3/4] w-52 rounded-2xl border border-border object-cover shadow-2xl" />
          <div className="max-w-xl">
            <p className="text-sm text-muted-foreground">{game.genre} · {game.releaseYear}</p>
            <h1 className="mt-2 font-display text-5xl font-bold">{game.title}</h1>
            <p className="mt-3 text-foreground/85">{game.tagline}</p>
            <Button size="lg" className="mt-6 rounded-full px-10" disabled={status === "unavailable" || status === "downloading"} onClick={action.onClick}>
              <action.icon /> {action.label}
            </Button>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-[1fr_340px] gap-12 px-12">
        <div>
          <h2 className="font-display text-xl font-semibold">About</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{game.description}</p>
          <h2 className="mt-10 font-display text-xl font-semibold">Screenshots</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {game.screenshots.map((s) => (
              <button key={s} onClick={() => setShot(s)} className="overflow-hidden rounded-xl border border-border">
                <img src={s} alt="" loading="lazy" className="aspect-video w-full object-cover transition-transform duration-500 hover:scale-105" />
              </button>
            ))}
          </div>
        </div>
        <aside className="space-y-6">
          <dl className="rounded-2xl border border-border bg-card p-6 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border py-2.5 last:border-0"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <div className="rounded-2xl border border-border bg-card p-6 text-sm">
            <h3 className="mb-3 font-display font-semibold">System requirements</h3>
            {Object.entries(game.requirements).map(([k, v]) => (
              <div key={k} className="py-1.5"><span className="text-muted-foreground uppercase text-xs">{k}</span><p>{v}</p></div>
            ))}
          </div>
        </aside>
      </div>
      <Dialog open={!!shot} onOpenChange={() => setShot(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">{shot && <img src={shot} alt="" className="w-full" />}</DialogContent>
      </Dialog>
    </div>
  );
}
