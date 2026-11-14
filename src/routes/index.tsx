import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Info,
  Music,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameRow } from "@/components/carousels/GameRow";
import { featuredGameId, games, getGame, installedGames, recentlyAddedIds } from "@/data/mockGames";
import type { LibraryGame } from "../../electron/shared.cjs";
import { toast } from "sonner";

let consoleAudio: AudioContext | null = null;

function getConsoleAudio(): AudioContext {
  consoleAudio ??= new AudioContext();
  if (consoleAudio.state === "suspended") void consoleAudio.resume();
  return consoleAudio;
}

function playConsoleSound(enabled: boolean, confirm = false): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    const context = getConsoleAudio();
    const notes = confirm ? [520, 780, 1040] : [640, 880];
    const start = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * (confirm ? 0.055 : 0.035);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(confirm ? 0.045 : 0.025, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + (confirm ? 0.17 : 0.11));
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + (confirm ? 0.18 : 0.12));
    });
  } catch {
    // Audio is optional; keep navigation and launching available if audio is blocked.
  }
}

function startAmbientTrack(): () => void {
  const context = getConsoleAudio();
  const filter = context.createBiquadFilter();
  const volume = context.createGain();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  volume.gain.setValueAtTime(0.0001, context.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 2);
  filter.connect(volume).connect(context.destination);
  const voices = [110, 164.81, 220].map((frequency, index) => {
    const voice = context.createOscillator();
    const voiceGain = context.createGain();
    voice.type = index === 2 ? "triangle" : "sine";
    voice.frequency.value = frequency;
    voiceGain.gain.value = index === 2 ? 0.16 : 0.28;
    voice.connect(voiceGain).connect(filter);
    voice.start();
    return voice;
  });
  return () => {
    const now = context.currentTime;
    volume.gain.cancelScheduledValues(now);
    volume.gain.setTargetAtTime(0.0001, now, 0.12);
    window.setTimeout(() => {
      voices.forEach((voice) => {
        try {
          voice.stop();
        } catch {
          // The track may already have stopped during unmount.
        }
      });
      filter.disconnect();
      volume.disconnect();
    }, 500);
  };
}

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
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [uiSoundsOn, setUiSoundsOn] = useState(true);
  const [ambientOn, setAmbientOn] = useState(false);
  const [backgroundLoadingId, setBackgroundLoadingId] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const backgroundLookups = useRef(new Set<string>());

  useEffect(() => {
    if (!ambientOn) return;
    try {
      return startAmbientTrack();
    } catch {
      setAmbientOn(false);
      toast.error("Could not start ambient audio");
    }
  }, [ambientOn]);

  useEffect(() => {
    void window
      .nexus!.getLibrary()
      .then(setLibrary)
      .catch(() => toast.error("Could not load your library"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (library.length && !library.some((game) => game.id === focusedId)) {
      setFocusedId((library.find((game) => game.executablePath) ?? library[0])?.id ?? null);
    }
  }, [library, focusedId]);

  const featured =
    library.find((game) => game.id === focusedId) ??
    library.find((game) => game.executablePath) ??
    library[0];
  const featuredBackground = featured?.backgroundImage || featured?.cover;
  const featuredId = featured?.id;
  const featuredBackgroundImage = featured?.backgroundImage;
  const featuredExecutablePath = featured?.executablePath;

  useEffect(() => {
    if (!featuredId || !featuredExecutablePath || featuredBackgroundImage || !window.nexus) return;
    if (backgroundLookups.current.has(featuredId)) return;
    backgroundLookups.current.add(featuredId);
    const gameId = featuredId;
    setBackgroundLoadingId(gameId);
    void window.nexus
      .findGameBackground(gameId)
      .then((updated) => {
        setLibrary((current) => current.map((game) => (game.id === updated.id ? updated : game)));
        toast.success(`Home background updated for ${updated.title}`);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not find game background art");
      })
      .finally(() => setBackgroundLoadingId(null));
  }, [featuredId, featuredExecutablePath, featuredBackgroundImage]);
  const launch = useCallback(
    async (game: LibraryGame) => {
      try {
        playConsoleSound(uiSoundsOn, true);
        await window.nexus!.launchGame(game.id);
        toast.success(`Launched ${game.title}`);
      } catch {
        toast.error(`Could not launch ${game.title}`);
      }
    },
    [uiSoundsOn],
  );

  const selectGame = useCallback(
    (game: LibraryGame) => {
      if (focusedId === game.id) return;
      setFocusedId(game.id);
      playConsoleSound(uiSoundsOn);
    },
    [focusedId, uiSoundsOn],
  );

  const moveSelection = useCallback(
    (direction: -1 | 1) => {
      if (!library.length) return;
      const currentIndex = Math.max(
        0,
        library.findIndex((game) => game.id === featured?.id),
      );
      const nextIndex = Math.max(0, Math.min(library.length - 1, currentIndex + direction));
      selectGame(library[nextIndex]!);
      carouselRef.current?.children[nextIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    },
    [featured?.id, library, selectGame],
  );

  useEffect(() => {
    let frame = 0;
    let lastDirection: -1 | 0 | 1 = 0;
    let repeatAt = 0;
    let previousConfirm = false;
    const readController = () => {
      const controller = navigator.getGamepads?.().find((gamepad) => gamepad?.connected);
      if (controller) {
        const axis = controller.axes[0] ?? 0;
        const direction: -1 | 0 | 1 =
          controller.buttons[14]?.pressed || axis < -0.55
            ? -1
            : controller.buttons[15]?.pressed || axis > 0.55
              ? 1
              : 0;
        const now = performance.now();
        if (direction && (direction !== lastDirection || now >= repeatAt)) {
          moveSelection(direction);
          repeatAt = now + 320;
        }
        lastDirection = direction;
        const confirm = Boolean(controller.buttons[0]?.pressed);
        if (confirm && !previousConfirm && featured?.executablePath) void launch(featured);
        previousConfirm = confirm;
      } else {
        lastDirection = 0;
        previousConfirm = false;
      }
      frame = requestAnimationFrame(readController);
    };
    frame = requestAnimationFrame(readController);
    return () => cancelAnimationFrame(frame);
  }, [featured, launch, moveSelection]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden pb-16">
      <header className="relative z-30 flex h-[76px] items-center justify-between border-b border-white/10 bg-background/45 px-8 backdrop-blur-xl md:px-12">
        <Link to="/" className="flex items-center gap-3" aria-label="NEXUS home">
          <span className="grid size-10 place-items-center rounded-xl bg-primary font-display text-lg font-black text-primary-foreground shadow-lg shadow-primary/25">
            N
          </span>
          <span className="font-display text-sm font-bold tracking-[0.32em]">NEXUS</span>
        </Link>
        <nav className="flex h-full items-center gap-2" aria-label="Console navigation">
          <Link
            to="/"
            aria-current="page"
            className="flex h-full items-center border-b-2 border-primary px-5 text-sm font-semibold text-foreground"
          >
            Games
          </Link>
          <Link
            to="/explore"
            className="flex h-full items-center border-b-2 border-transparent px-5 text-sm text-muted-foreground transition hover:border-white/40 hover:text-foreground"
          >
            Explore
          </Link>
          <Link
            to="/library"
            className="flex h-full items-center border-b-2 border-transparent px-5 text-sm text-muted-foreground transition hover:border-white/40 hover:text-foreground"
          >
            Game Library
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-full ${ambientOn ? "text-primary" : "text-muted-foreground"}`}
            aria-label={ambientOn ? "Turn ambient music off" : "Turn ambient music on"}
            aria-pressed={ambientOn}
            onClick={() => setAmbientOn((on) => !on)}
          >
            <Music className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-full ${uiSoundsOn ? "text-foreground" : "text-muted-foreground"}`}
            aria-label={uiSoundsOn ? "Turn interface sounds off" : "Turn interface sounds on"}
            aria-pressed={uiSoundsOn}
            onClick={() => setUiSoundsOn((on) => !on)}
          >
            {uiSoundsOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </Button>
          <Link
            to="/library"
            className="ml-2 grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold"
          >
            W
          </Link>
        </div>
      </header>
      {featuredBackground && (
        <img
          key={featured.id}
          src={featuredBackground}
          alt=""
          className="fixed inset-0 z-0 h-screen w-screen scale-105 object-cover opacity-65 blur-[2px] animate-in fade-in duration-700"
        />
      )}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-background/30 via-background/45 to-background/90" />
      <section className="relative z-10 order-2 flex min-h-[360px] flex-1 items-end px-12 pb-10 pt-8">
        {featuredBackground && (
          <img
            key={`hero-${featured.id}`}
            src={featuredBackground}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center opacity-55 animate-in fade-in duration-700"
          />
        )}
        <div className="absolute inset-0 scrim-left" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
        <div className="relative z-10 max-w-2xl animate-in fade-in slide-in-from-bottom-3 duration-500">
          <p className="text-xs font-semibold tracking-[0.32em] text-primary uppercase">
            {backgroundLoadingId === featured?.id ? "Finding game artwork…" : "Play your way"}
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-tight drop-shadow-lg md:text-7xl">
            {loading ? "Loading your games…" : (featured?.title ?? "Welcome to NEXUS")}
          </h1>
          <p className="mt-3 text-sm text-foreground/80">
            {featured
              ? [featured.genre, featured.developer].filter(Boolean).join(" · ")
              : "Your games, ready when you are."}
          </p>
          <p className="mt-3 line-clamp-2 max-w-xl text-base text-foreground/85">
            {featured?.description ||
              (library.length
                ? "Choose an executable in your library to launch this game."
                : "Add a game you already own, or explore game information from a provider.")}
          </p>
          <div className="mt-7 flex gap-3">
            {featured?.executablePath ? (
              <Button size="lg" className="rounded-full px-8" onClick={() => void launch(featured)}>
                <Play className="fill-current" /> Play
              </Button>
            ) : (
              <Button size="lg" variant="secondary" className="rounded-full px-6" asChild>
                <Link to="/library">
                  <Gamepad2 /> Set up a game
                </Link>
              </Button>
            )}
            <Button size="lg" variant="secondary" className="rounded-full px-6" asChild>
              <Link to="/explore">
                <Info /> Explore
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <div
        className="relative z-10 order-1 px-8 pt-2 md:px-12"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            moveSelection(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveSelection(-1);
          }
        }}
      >
        {library.length ? (
          <DesktopGameRow
            title="Your games"
            games={library}
            focusedId={featured?.id ?? null}
            carouselRef={carouselRef}
            onFocusGame={selectGame}
            onLaunchGame={launch}
            uiSoundsOn={uiSoundsOn}
            onMove={moveSelection}
          />
        ) : (
          <div className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-8 backdrop-blur-md">
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
  focusedId,
  carouselRef,
  onFocusGame,
  onLaunchGame,
  uiSoundsOn,
  onMove,
}: {
  title: string;
  games: LibraryGame[];
  focusedId: string | null;
  carouselRef: React.RefObject<HTMLDivElement | null>;
  onFocusGame: (game: LibraryGame) => void;
  onLaunchGame: (game: LibraryGame) => void;
  uiSoundsOn: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <section className="mt-1">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.25em] text-primary uppercase">
            Game library
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            aria-label="Previous game"
            onClick={() => onMove(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            aria-label="Next game"
            onClick={() => onMove(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={carouselRef}
        className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-3 py-4"
      >
        {rowGames.map((game) => (
          <button
            key={game.id}
            onClick={() => {
              onFocusGame(game);
              if (game.executablePath) {
                onLaunchGame(game);
              } else {
                playConsoleSound(uiSoundsOn, true);
                toast.info("Choose this game's executable in My Library before launching it.");
              }
            }}
            onMouseEnter={() => onFocusGame(game)}
            onFocus={() => onFocusGame(game)}
            aria-pressed={focusedId === game.id}
            className={`group w-[min(74vw,330px)] shrink-0 snap-start text-left outline-none transition-transform duration-300 ${focusedId === game.id ? "scale-[1.02]" : "opacity-80 hover:opacity-100"}`}
          >
            <div
              className={`overflow-hidden rounded-2xl border bg-card shadow-xl transition-all duration-300 ${focusedId === game.id ? "border-primary ring-2 ring-primary/50" : "border-border group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-primary"}`}
            >
              {game.cover ? (
                <img
                  src={game.cover}
                  alt={game.title}
                  loading="lazy"
                  className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="grid aspect-video place-items-center bg-gradient-to-br from-primary/35 via-secondary to-background">
                  <Gamepad2 className="size-10 text-primary/80" />
                </div>
              )}
            </div>
            <p className="mt-3 font-display text-sm font-semibold">{game.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {game.executablePath ? "Ready to play" : "Set executable in Library"}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
