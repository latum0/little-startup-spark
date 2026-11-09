import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, MoreHorizontal, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getGame, installedGames } from "@/data/mockGames";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "My Library · NEXUS" },
      { name: "description", content: "Games installed on this PC." },
      { property: "og:title", content: "My Library · NEXUS" },
      { property: "og:description", content: "Games installed on this PC." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [q, setQ] = useState("");
  const [items, setItems] = useState(installedGames);
  const navigate = useNavigate();
  const list = items.map((i) => ({ ...i, game: getGame(i.gameId)! })).filter((i) => i.game.title.toLowerCase().includes(q.toLowerCase()));

  const menu = (id: string, title: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Options" className="grid size-8 place-items-center rounded-full bg-background/70 text-foreground hover:bg-accent"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => toast(`Launching ${title}… (demo)`)}>Play</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/games/$id", params: { id } })}>View details</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => { setItems((s) => s.filter((x) => x.gameId !== id)); toast(`${title} removed (demo)`); }}>Uninstall</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="px-12 pt-24 pb-16">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold">My Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">{items.length} games installed</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex w-64 items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search library" className="w-full bg-transparent outline-none" />
          </label>
          <div className="flex rounded-full bg-secondary p-1">
            {(["grid", "list"] as const).map((v) => (
              <button key={v} aria-label={v} onClick={() => setView(v)} className={cn("grid size-8 place-items-center rounded-full", view === v ? "bg-foreground text-background" : "text-muted-foreground")}>
                {v === "grid" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {view === "grid" ? (
        <div className="mt-8 grid grid-cols-5 gap-6">
          {list.map(({ game, lastPlayed }) => (
            <div key={game.id} className="group relative">
              <Link to="/games/$id" params={{ id: game.id }} className="block overflow-hidden rounded-2xl border border-border transition-all group-hover:focus-glow">
                <img src={game.cover} alt={game.title} className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </Link>
              <div className="absolute top-3 right-3">{menu(game.id, game.title)}</div>
              <p className="mt-3 font-display text-sm font-semibold">{game.title}</p>
              <p className="text-xs text-muted-foreground">{game.sizeGB} GB · {lastPlayed}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
          {list.map(({ game, lastPlayed, location }) => (
            <div key={game.id} className="flex items-center gap-5 p-4">
              <img src={game.cover} alt="" className="h-14 w-24 rounded-lg object-cover" />
              <div className="flex-1">
                <p className="font-display font-semibold">{game.title}</p>
                <p className="text-xs text-muted-foreground">{location}</p>
              </div>
              <span className="w-24 text-sm text-muted-foreground">{game.sizeGB} GB</span>
              <span className="w-32 text-sm text-muted-foreground">{lastPlayed}</span>
              {menu(game.id, game.title)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
