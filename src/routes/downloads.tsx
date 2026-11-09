import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Pause, Play, X } from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { getGame, mockDownloads } from "@/data/mockGames";
import type { Download } from "@/types/game";

export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "Downloads · NEXUS" },
      { name: "description", content: "Manage active, queued and completed downloads." },
      { property: "og:title", content: "Downloads · NEXUS" },
      { property: "og:description", content: "Manage your downloads." },
    ],
  }),
  component: DownloadsPage,
});

function DownloadsPage() {
  const [items, setItems] = useState<Download[]>(mockDownloads);
  const toggle = (id: string) => setItems((s) => s.map((d) => (d.id === id ? { ...d, state: d.state === "active" ? "paused" : "active" } : d)));
  const cancel = (id: string) => setItems((s) => s.filter((d) => d.id !== id));
  const section = (title: string, list: Download[]) =>
    list.length > 0 && (
      <section className="mt-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-muted-foreground">{title}</h2>
        <div className="space-y-3">{list.map((d) => <Row key={d.id} d={d} onToggle={toggle} onCancel={cancel} />)}</div>
      </section>
    );
  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Downloads</h1>
      {section("In progress", items.filter((d) => d.state === "active" || d.state === "paused"))}
      {section("Queued", items.filter((d) => d.state === "queued"))}
      {section("Completed", items.filter((d) => d.state === "completed"))}
    </div>
  );
}

function Row({ d, onToggle, onCancel }: { d: Download; onToggle: (id: string) => void; onCancel: (id: string) => void }) {
  const g = getGame(d.gameId)!;
  const done = (g.sizeGB * d.progress) / 100;
  const etaMin = d.speedMBs ? Math.round(((g.sizeGB - done) * 1024) / d.speedMBs / 60) : 0;
  const live = d.state === "active" || d.state === "paused";
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-border bg-card p-4">
      <img src={g.cover} alt="" className="h-20 w-36 rounded-xl object-cover" />
      <div className="flex-1">
        <p className="font-display font-semibold">{g.title}</p>
        {live ? (
          <>
            <Progress value={d.progress} className="mt-3 h-1.5" />
            <div className="mt-2 flex gap-6 text-xs text-muted-foreground">
              <span>{done.toFixed(1)} / {g.sizeGB} GB</span>
              <span>{d.state === "active" ? `${d.speedMBs} MB/s` : "Paused"}</span>
              {d.state === "active" && <span>{etaMin} min left</span>}
            </div>
          </>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {d.state === "completed" ? <><CheckCircle2 className="size-3.5 text-success" /> Installed · {g.sizeGB} GB</> : `Waiting · ${g.sizeGB} GB`}
          </p>
        )}
      </div>
      {live && (
        <button onClick={() => onToggle(d.id)} aria-label="Pause or resume" className="grid size-10 place-items-center rounded-full bg-secondary hover:bg-accent">
          {d.state === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      )}
      {d.state !== "completed" && (
        <button onClick={() => onCancel(d.id)} aria-label="Cancel" className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
      )}
    </div>
  );
}
