import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Gamepad2,
  Image,
  LayoutGrid,
  List,
  MoreHorizontal,
  Play,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getGame, installedGames } from "@/data/mockGames";
import { cn } from "@/lib/utils";
import type { GameMetadataInput, LibraryGame } from "../../electron/shared.cjs";

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
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);
  return isDesktop ? <DesktopLibraryPage /> : <MockLibraryPage />;
}

function MockLibraryPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [q, setQ] = useState("");
  const [items, setItems] = useState(installedGames);
  const navigate = useNavigate();
  const list = items
    .map((i) => ({ ...i, game: getGame(i.gameId)! }))
    .filter((i) => i.game.title.toLowerCase().includes(q.toLowerCase()));

  const menu = (id: string, title: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Options"
        className="grid size-8 place-items-center rounded-full bg-background/70 text-foreground hover:bg-accent"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => toast(`Launching ${title}… (demo)`)}>
          Play
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/games/$id", params: { id } })}>
          View details
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            setItems((s) => s.filter((x) => x.gameId !== id));
            toast(`${title} removed (demo)`);
          }}
        >
          Uninstall
        </DropdownMenuItem>
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
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search library"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <div className="flex rounded-full bg-secondary p-1">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                aria-label={v}
                onClick={() => setView(v)}
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  view === v ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
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
              <Link
                to="/games/$id"
                params={{ id: game.id }}
                className="block overflow-hidden rounded-2xl border border-border transition-all group-hover:focus-glow"
              >
                <img
                  src={game.cover}
                  alt={game.title}
                  className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </Link>
              <div className="absolute top-3 right-3">{menu(game.id, game.title)}</div>
              <p className="mt-3 font-display text-sm font-semibold">{game.title}</p>
              <p className="text-xs text-muted-foreground">
                {game.sizeGB} GB · {lastPlayed}
              </p>
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

function GameEditorDialog({
  game,
  onClose,
  onSave,
}: {
  game: LibraryGame | null;
  onClose: () => void;
  onSave: (details: GameMetadataInput) => Promise<void>;
}) {
  const [details, setDetails] = useState<GameMetadataInput>({
    title: "",
    description: "",
    genre: "",
    releaseDate: "",
    developer: "",
    publisher: "",
  });

  useEffect(() => {
    if (game) {
      setDetails({
        title: game.title,
        description: game.description,
        genre: game.genre,
        releaseDate: game.releaseDate,
        developer: game.developer,
        publisher: game.publisher,
      });
    }
  }, [game]);

  const update = (key: keyof GameMetadataInput, value: string) =>
    setDetails((current) => ({ ...current, [key]: value }));

  return (
    <Dialog
      open={!!game}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit game information</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(details);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title">
              <Input
                value={details.title}
                onChange={(event) => update("title", event.target.value)}
                required
                maxLength={120}
              />
            </Field>
            <Field label="Genre">
              <Input
                value={details.genre}
                onChange={(event) => update("genre", event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Release date">
              <Input
                value={details.releaseDate}
                onChange={(event) => update("releaseDate", event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Developer">
              <Input
                value={details.developer}
                onChange={(event) => update("developer", event.target.value)}
                maxLength={200}
              />
            </Field>
            <Field label="Publisher">
              <Input
                value={details.publisher}
                onChange={(event) => update("publisher", event.target.value)}
                maxLength={200}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={details.description}
              onChange={(event) => update("description", event.target.value)}
              maxLength={5000}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-full">
              Save information
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DesktopLibraryPage() {
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [editingGame, setEditingGame] = useState<LibraryGame | null>(null);

  const refresh = async () => {
    try {
      setGames(await window.nexus!.getLibrary());
    } catch {
      toast.error("Could not load your library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const addGame = async () => {
    try {
      const game = await window.nexus!.chooseAndAddGame();
      if (game) {
        await refresh();
        toast.success(`${game.title} added to your library`);
      }
    } catch {
      toast.error("Could not add that executable");
    }
  };

  const addGameFromFolder = async () => {
    try {
      const game = await window.nexus!.chooseAndAddGameFromFolder();
      if (game) {
        await refresh();
        toast.success(`${game.title} added to your library`);
      }
    } catch {
      toast.error("Could not add a game from that folder");
    }
  };

  const saveGameDetails = async (details: GameMetadataInput) => {
    if (!editingGame) return;
    try {
      const updated = await window.nexus!.updateGame(editingGame.id, details);
      setGames((current) => current.map((game) => (game.id === updated.id ? updated : game)));
      setEditingGame(null);
      toast.success("Game information saved");
    } catch {
      toast.error("Could not save game information");
    }
  };

  const updateExecutable = async (game: LibraryGame) => {
    try {
      await window.nexus!.chooseExecutableForGame(game.id);
      await refresh();
      toast.success(`Executable updated for ${game.title}; repack files are removed when found`);
    } catch {
      toast.error("Could not update the executable");
    }
  };

  const updateCover = async (game: LibraryGame) => {
    try {
      const updated = await window.nexus!.chooseCoverForGame(game.id);
      setGames((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.cover !== game.cover) toast.success(`Cover updated for ${game.title}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Could not update the cover for ${game.title}`,
      );
    }
  };

  const launchGame = async (game: LibraryGame) => {
    try {
      await window.nexus!.launchGame(game.id);
      toast.success(`Launched ${game.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not launch ${game.title}`);
    }
  };

  const removeGame = async (game: LibraryGame) => {
    if (
      !window.confirm(
        `Remove ${game.title} from your NEXUS library? This will not delete game files.`,
      )
    )
      return;
    try {
      await window.nexus!.removeGame(game.id);
      await refresh();
      toast.success(`${game.title} removed from your library`);
    } catch {
      toast.error(`Could not remove ${game.title}`);
    }
  };

  const uninstallGame = async (game: LibraryGame) => {
    if (!game.installPath || !game.executablePath) {
      toast.error("Select this game's executable before deleting its files");
      return;
    }
    if (
      !window.confirm(
        `Permanently delete ${game.title} and everything in:\n${game.installPath}\n\nThis cannot be undone.`,
      )
    )
      return;
    try {
      await window.nexus!.uninstallGame(game.id);
      await refresh();
      toast.success(`${game.title} and its files were deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not uninstall ${game.title}`);
    }
  };

  const filtered = games.filter((game) =>
    game.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const menu = (game: LibraryGame) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Options for ${game.title}`}
        className="grid size-8 place-items-center rounded-full bg-background/70 text-foreground hover:bg-accent"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setEditingGame(game)}>Edit information</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void updateCover(game)}>
          <Image className="mr-2 size-4" /> Change cover image
        </DropdownMenuItem>
        {game.executablePath ? (
          <DropdownMenuItem
            onClick={async () => {
              try {
                await window.nexus!.launchGame(game.id);
                toast.success(`Launched ${game.title}`);
              } catch {
                toast.error(`Could not launch ${game.title}`);
              }
            }}
          >
            <Play className="mr-2 size-4" />
            Play
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => void updateExecutable(game)}>
          {game.executablePath ? "Change executable" : "Select executable"}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => void removeGame(game)}>
          Remove from library
        </DropdownMenuItem>
        {game.installPath && game.executablePath ? (
          <DropdownMenuItem className="text-destructive" onClick={() => void uninstallGame(game)}>
            Uninstall and delete files
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const cover = (game: LibraryGame, className: string) =>
    game.cover ? (
      <img src={game.cover} alt={game.title} className={className} />
    ) : (
      <div
        className={cn(
          className,
          "grid place-items-center bg-gradient-to-br from-primary/35 via-secondary to-background",
        )}
      >
        <Gamepad2 className="size-10 text-primary/80" />
      </div>
    );

  return (
    <div className="px-12 pt-24 pb-16">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold">My Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {games.filter((game) => game.executablePath).length} installed · {games.length} in
            library
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex w-64 items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search library"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <div className="flex rounded-full bg-secondary p-1">
            {(["grid", "list"] as const).map((option) => (
              <button
                key={option}
                aria-label={`${option} view`}
                onClick={() => setView(option)}
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  view === option ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                {option === "grid" ? (
                  <LayoutGrid className="size-4" />
                ) : (
                  <List className="size-4" />
                )}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-full">
                <Plus className="size-4" />
                Add game
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void addGame()}>Choose executable</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void addGameFromFolder()}>
                Choose installation folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {loading ? (
        <p className="mt-12 text-center text-muted-foreground">Loading library…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          {games.length
            ? "No games match your search."
            : "Your library is empty. Add an installed game or choose a game from Explore."}
        </p>
      ) : view === "grid" ? (
        <div className="mt-8 grid grid-cols-5 gap-6">
          {filtered.map((game) => (
            <div key={game.id} className="group relative">
              {cover(
                game,
                "aspect-[3/4] w-full rounded-2xl border border-border object-cover transition-transform duration-300 group-hover:scale-[1.02]",
              )}
              <div className="absolute top-3 right-3">{menu(game)}</div>
              <p className="mt-3 font-display text-sm font-semibold">{game.title}</p>
              <p className="text-xs text-muted-foreground">
                {game.executablePath ? "Installed" : "Select executable to launch"}
              </p>
              <Button
                size="sm"
                variant={game.executablePath ? "default" : "secondary"}
                className="mt-2 rounded-full"
                onClick={() =>
                  game.executablePath ? void launchGame(game) : void updateExecutable(game)
                }
              >
                {game.executablePath ? (
                  <>
                    <Play className="mr-1 size-4" /> Play
                  </>
                ) : (
                  "Choose game .exe"
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
          {filtered.map((game) => (
            <div key={game.id} className="flex items-center gap-5 p-4">
              {cover(game, "h-14 w-24 rounded-lg object-cover")}
              <div className="flex-1">
                <p className="font-display font-semibold">{game.title}</p>
                <p className="text-xs text-muted-foreground">
                  {game.installPath ?? "Executable not selected"}
                </p>
              </div>
              <span className="w-32 text-sm text-muted-foreground">
                {game.executablePath ? "Installed" : "Not installed"}
              </span>
              <Button
                size="sm"
                variant={game.executablePath ? "default" : "secondary"}
                className="rounded-full"
                onClick={() =>
                  game.executablePath ? void launchGame(game) : void updateExecutable(game)
                }
              >
                {game.executablePath ? (
                  <>
                    <Play className="mr-1 size-4" /> Play
                  </>
                ) : (
                  "Choose .exe"
                )}
              </Button>
              {menu(game)}
            </div>
          ))}
        </div>
      )}
      <GameEditorDialog
        game={editingGame}
        onClose={() => setEditingGame(null)}
        onSave={saveGameDetails}
      />
    </div>
  );
}
