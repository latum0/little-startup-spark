import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ExternalLink, Pause, Play, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFitGirlGameDetail } from "@/lib/gameCatalog.functions";
import type { LibraryGame, TorrentStatus } from "../../electron/shared.cjs";

export const Route = createFileRoute("/games/fitgirl/$slug")({
  loader: async ({ params }) => {
    const detail =
      typeof window !== "undefined" && window.nexus
        ? await window.nexus.getFitGirlGameDetail(params.slug)
        : await getFitGirlGameDetail({ data: { slug: params.slug } });
    return { detail };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.detail.title} · NEXUS` : "Game · NEXUS" },
      {
        name: "description",
        content: loaderData?.detail.description.slice(0, 160) ?? "FitGirl repack details",
      },
    ],
  }),
  component: FitGirlGameDetails,
});

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function FitGirlGameDetails() {
  const { detail } = Route.useLoaderData();
  const [isDesktop, setIsDesktop] = useState(false);
  const [libraryGame, setLibraryGame] = useState<LibraryGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [infoHash, setInfoHash] = useState<string | null>(null);
  const [progress, setProgress] = useState<TorrentStatus | null>(null);

  const torrent = detail.torrents.find((item) => item.label === "Magnet link") ?? detail.torrents[0] ?? null;

  useEffect(() => {
    if (!window.nexus) return;
    setIsDesktop(true);
    void window.nexus.getLibrary().then((lib) => {
      const found = lib.find((g) => g.title.toLowerCase() === detail.title.toLowerCase());
      setLibraryGame(found ?? null);
    });
    void window.nexus.getTorrentStatuses().then((statuses) => {
      const current = statuses.find((status) =>
        status.name.toLowerCase().includes(detail.title.toLowerCase()),
      );
      if (current) {
        setInfoHash(current.infoHash);
        setProgress(current);
      }
    });

    // Listen for torrent progress
    const unsub = window.nexus.onTorrentProgress((statuses) => {
      if (infoHash) {
        const match = statuses.find((s) => s.infoHash === infoHash);
        if (match) setProgress(match);
      } else if (!infoHash && torrent) {
        // Auto-find if app restarted but torrent is already running
        const match = statuses.find((s) => s.name.toLowerCase().includes(detail.title.toLowerCase()));
        if (match) {
          setInfoHash(match.infoHash);
          setProgress(match);
        }
      }
    });
    return unsub;
  }, [detail.title, infoHash, torrent]);

  const handleDownload = async () => {
    if (!torrent) {
      toast.error("No torrent link was found on the FitGirl page.");
      return;
    }
    if (!isDesktop || !window.nexus) {
      toast.error("In-app torrent downloading requires the NEXUS desktop app.");
      return;
    }

    setBusy(true);
    try {
      const settings = await window.nexus.getSettings();
      const safeTitle = detail.title.replace(/[<>:"/\\|?*]+/g, "").trim().replace(/[. ]+$/g, "") || "Game";
      const savePath = `${settings.downloadDirectory}\\${safeTitle}`;

      const hash = await window.nexus.startTorrentDownload(torrent.url, savePath);
      setInfoHash(hash);
      const added = await window.nexus.addExternalMetadata({
        title: detail.title,
        description: detail.description.slice(0, 1000),
        genre: detail.genre,
        releaseDate: detail.releaseYear ? `${detail.releaseYear}` : "",
        developer: detail.developer,
        publisher: detail.publisher,
        cover: detail.cover || null,
      });
      setLibraryGame(added);
      toast.success("Download started in app!");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not start the torrent download.");
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    if (!isDesktop || !libraryGame || !window.nexus) return;
    if (!confirm(`Remove "${detail.title}" from your library?`)) return;
    setBusy(true);
    try {
      if (infoHash) {
        await window.nexus.removeTorrent(infoHash);
        setInfoHash(null);
        setProgress(null);
      }
      await window.nexus.removeGame(libraryGame.id);
      setLibraryGame(null);
      toast.success("Removed from library");
    } catch {
      toast.error("Failed to remove from library");
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    if (!window.nexus || !infoHash || !progress) return;
    if (progress.state === "paused") {
      await window.nexus.resumeTorrent(infoHash);
      toast.success("Resumed");
    } else {
      await window.nexus.pauseTorrent(infoHash);
      toast.success("Paused");
    }
  };

  const stopDownload = async () => {
    if (!window.nexus || !infoHash) return;
    try {
      await window.nexus.removeTorrent(infoHash);
      setInfoHash(null);
      setProgress(null);
      toast.success("Game download stopped");
    } catch {
      toast.error("Could not stop the game download");
    }
  };

  const chooseExecutable = async () => {
    if (!window.nexus || !libraryGame) return;
    setBusy(true);
    try {
      setLibraryGame(await window.nexus.chooseExecutableForGame(libraryGame.id));
      toast.success("Game executable saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not select the game executable");
    } finally {
      setBusy(false);
    }
  };

  const launchGame = async () => {
    if (!window.nexus || !libraryGame) return;
    try {
      await window.nexus.launchGame(libraryGame.id);
      toast.success(`Launched ${libraryGame.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not launch this game");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-12 pt-24 pb-16">
      <Link to="/explore" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to Explore
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-10 md:grid-cols-[300px_1fr]">
        <div>
          {detail.cover ? (
            <img
              src={detail.cover}
              alt={detail.title}
              className="aspect-[3/4] w-full rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl border border-border bg-secondary text-sm text-muted-foreground">
              No cover
            </div>
          )}
        </div>

        <div>
          <h1 className="font-display text-4xl font-bold">{detail.title}</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            {detail.genre}
            {detail.releaseYear ? ` · ${detail.releaseYear}` : ""}
            {detail.sizeGB ? ` · ${detail.sizeGB}` : ""}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {progress ? (
              <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="truncate pr-2">{progress.name}</span>
                  <span>{Math.round(progress.progress * 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress.progress * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(progress.downloadSpeed)}/s</span>
                  <span>{progress.numPeers} peers</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={togglePause}>
                      {progress.state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void stopDownload()}>
                      <X className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                size="lg"
                className="rounded-full px-8"
                onClick={handleDownload}
                disabled={busy || !torrent}
              >
                <Download /> {busy ? "Starting…" : libraryGame ? "Download again" : "Download in App"}
              </Button>
            )}

            {libraryGame && !progress && (
              libraryGame.executablePath ? (
                <Button size="lg" variant="secondary" className="rounded-full px-8" onClick={() => void launchGame()}>
                  <Play /> Play
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="rounded-full px-8" onClick={() => void chooseExecutable()} disabled={busy}>
                  <Play /> Choose executable
                </Button>
              )
            )}
            {libraryGame && (
              <Button
                size="lg"
                variant="ghost"
                className="rounded-full px-8 text-destructive"
                onClick={handleUninstall}
                disabled={busy}
              >
                <Trash2 /> Remove from library
              </Button>
            )}
            <Button size="lg" variant="ghost" className="rounded-full" asChild>
              <a href={detail.originalUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> View on FitGirl
              </a>
            </Button>
          </div>

          {torrent ? (
            <p className="mt-3 break-all text-xs text-muted-foreground">
              Torrent: <span className="text-foreground/80">{torrent.label}</span> ·{" "}
              {torrent.url.slice(0, 80)}
              {torrent.url.length > 80 ? "…" : ""}
            </p>
          ) : (
            <p className="mt-3 text-xs text-amber-500">
              No torrent or magnet link detected on the FitGirl page.
            </p>
          )}

          <h2 className="mt-10 font-display text-xl font-semibold">Description</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">
            {detail.description || "No description available."}
          </p>

          {detail.screenshots.length > 0 && (
            <>
              <h2 className="mt-10 font-display text-xl font-semibold">Screenshots</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {detail.screenshots.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
