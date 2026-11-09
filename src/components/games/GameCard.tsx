import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import type { Game } from "@/types/game";
import { cn } from "@/lib/utils";

export function GameCard({ game, subtitle, className }: { game: Game; subtitle?: string; className?: string }) {
  return (
    <Link to="/games/$id" params={{ id: game.id }} className={cn("group block shrink-0 outline-none", className)}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 group-hover:-translate-y-1 group-hover:focus-glow group-focus-visible:focus-glow">
        <img src={game.cover} alt={game.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
        <div className="absolute inset-0 scrim-bottom opacity-90" />
        {game.status === "installed" && <CheckCircle2 className="absolute top-3 right-3 size-5 text-success" />}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display text-sm font-semibold">{game.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle ?? game.genre}</p>
          <div className="mt-2 max-h-0 overflow-hidden text-xs text-muted-foreground opacity-0 transition-all duration-300 group-hover:max-h-10 group-hover:opacity-100">
            {game.releaseYear} · {game.sizeGB} GB · {game.status === "installed" ? "Installed" : game.status === "available" ? "Available" : "Unavailable"}
          </div>
        </div>
      </div>
    </Link>
  );
}
