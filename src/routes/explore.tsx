import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { GameCard } from "@/components/games/GameCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories, games } from "@/data/mockGames";
import { cn } from "@/lib/utils";

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

const genres = ["All genres", ...Array.from(new Set(games.map((g) => g.genre)))];

function Explore() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [genre, setGenre] = useState("All genres");
  const [sort, setSort] = useState("popular");
  const list = useMemo(() => {
    const r = games.filter((g) => g.title.toLowerCase().includes(q.toLowerCase()) && (cat === "All" || g.category === cat) && (genre === "All genres" || g.genre === genre));
    return r.sort((a, b) => (sort === "popular" ? b.popularity - a.popularity : sort === "newest" ? b.releaseYear - a.releaseYear : a.title.localeCompare(b.title)));
  }, [q, cat, genre, sort]);

  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Explore</h1>
      <div className="mt-8 flex items-center gap-3">
        <label className="flex w-72 items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog" className="w-full bg-transparent outline-none" />
        </label>
        <div className="flex gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-4 py-2 text-sm font-medium transition-colors", cat === c ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground")}>{c}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-3">
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger className="w-48 rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>{genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-36 rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">Most popular</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="az">A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-5 gap-6">
        {list.map((g) => <GameCard key={g.id} game={g} />)}
      </div>
      {list.length === 0 && <p className="mt-16 text-center text-muted-foreground">No games match your filters.</p>}
    </div>
  );
}
