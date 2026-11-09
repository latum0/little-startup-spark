import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import type { Game } from "@/types/game";
import { GameCard } from "@/components/games/GameCard";

export function GameRow({ title, games, subtitles }: { title: string; games: Game[]; subtitles?: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * 600, behavior: "smooth" });
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <div className="flex gap-2">
          {[-1, 1].map((d) => (
            <button key={d} onClick={() => scroll(d)} aria-label={d < 0 ? "Previous" : "Next"} className="grid size-8 place-items-center rounded-full border border-border bg-secondary text-muted-foreground hover:text-foreground">
              {d < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="no-scrollbar -mx-2 flex gap-5 overflow-x-auto px-2 py-3">
        {games.map((g) => <GameCard key={g.id} game={g} subtitle={subtitles?.[g.id]} className="w-48" />)}
      </div>
    </section>
  );
}
