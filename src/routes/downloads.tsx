import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Download as DownloadIcon, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getGame, mockDownloads } from "@/data/mockGames";
import type { Download } from "@/types/game";
import { toast } from "sonner";
import type { DownloadItem, DownloadProgress, TorrentStatus } from "../../electron/shared.cjs";

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
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);
  return isDesktop ? <DesktopDownloadsPage /> : <MockDownloadsPage />;
}

function MockDownloadsPage() {
  const [items, setItems] = useState<Download[]>(mockDownloads);
  const toggle = (id: string) =>
    setItems((s) =>
      s.map((d) => (d.id === id ? { ...d, state: d.state === "active" ? "paused" : "active" } : d)),
    );
  const cancel = (id: string) => setItems((s) => s.filter((d) => d.id !== id));
  const section = (title: string, list: Download[]) =>
    list.length > 0 && (
      <section className="mt-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-muted-foreground">{title}</h2>
        <div className="space-y-3">
          {list.map((d) => (
            <Row key={d.id} d={d} onToggle={toggle} onCancel={cancel} />
          ))}
        </div>
      </section>
    );
  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Downloads</h1>
      {section(
        "In progress",
        items.filter((d) => d.state === "active" || d.state === "paused"),
      )}
      {section(
        "Queued",
        items.filter((d) => d.state === "queued"),
      )}
      {section(
        "Completed",
        items.filter((d) => d.state === "completed"),
      )}
    </div>
  );
}

function DesktopDownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [torrents, setTorrents] = useState<TorrentStatus[]>([]);
  const [speedById, setSpeedById] = useState<Record<string, number>>({});
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [downloads, activeTorrents] = await Promise.all([
        window.nexus!.getDownloads(),
        window.nexus!.getTorrentStatuses(),
      ]);
      setItems(downloads);
      setTorrents(activeTorrents);
    } catch {
      toast.error("Could not load downloads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const stopDownloadUpdates = window.nexus!.onDownloadProgress((progress: DownloadProgress) => {
      setSpeedById((current) => ({ ...current, [progress.downloadId]: progress.bytesPerSecond }));
      setItems((current) =>
        current.map((item) =>
          item.id === progress.downloadId
            ? {
                ...item,
                receivedBytes: progress.receivedBytes,
                totalBytes: progress.totalBytes,
                state: progress.state,
              }
            : item,
        ),
      );
    });
    const stopTorrentUpdates = window.nexus!.onTorrentProgress(setTorrents);
    return () => {
      stopDownloadUpdates();
      stopTorrentUpdates();
    };
  }, []);

  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const item = await window.nexus!.addDownload(url.trim());
      if (item) {
        setItems((current) => [item, ...current]);
        setUrl("");
        toast.success("Download started");
      }
    } catch {
      toast.error("Enter a direct HTTP or HTTPS download URL");
    }
  };

  const cancel = async (id: string) => {
    try {
      await window.nexus!.cancelDownload(id);
      await refresh();
    } catch {
      toast.error("Could not cancel this download");
    }
  };

  const resume = async (id: string) => {
    try {
      await window.nexus!.resumeDownload(id);
      await refresh();
    } catch {
      toast.error("Could not resume this download");
    }
  };

  const toggleTorrent = async (torrent: TorrentStatus) => {
    try {
      if (torrent.state === "paused") await window.nexus!.resumeTorrent(torrent.infoHash);
      else await window.nexus!.pauseTorrent(torrent.infoHash);
      setTorrents(await window.nexus!.getTorrentStatuses());
    } catch {
      toast.error("Could not update this game download");
    }
  };

  const removeTorrent = async (infoHash: string) => {
    try {
      await window.nexus!.removeTorrent(infoHash);
      setTorrents(await window.nexus!.getTorrentStatuses());
    } catch {
      toast.error("Could not stop this game download");
    }
  };

  const sections: [string, DownloadItem[]][] = [
    ["In progress", items.filter((item) => item.state === "downloading")],
    [
      "Waiting or paused",
      items.filter((item) => item.state === "queued" || item.state === "paused"),
    ],
    ["Completed", items.filter((item) => item.state === "completed")],
    [
      "Stopped or failed",
      items.filter((item) => item.state === "cancelled" || item.state === "failed"),
    ],
  ];

  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Downloads</h1>
      <form
        onSubmit={add}
        className="mt-8 flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <DownloadIcon className="size-5 shrink-0 text-primary" />
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a direct HTTP or HTTPS file link"
          aria-label="Download URL"
          required
        />
        <Button type="submit" className="shrink-0 rounded-full">
          Choose location
        </Button>
      </form>
      {loading ? (
        <p className="mt-10 text-muted-foreground">Loading downloads…</p>
      ) : sections.every(([, list]) => list.length === 0) && torrents.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">
          No downloads yet. Add a direct download link above.
        </p>
      ) : (
        <>
          {torrents.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 font-display text-lg font-semibold text-muted-foreground">
                Game downloads
              </h2>
              <div className="space-y-3">
                {torrents.map((torrent) => {
                  const percent = Math.min(100, torrent.progress * 100);
                  return (
                    <div
                      key={torrent.infoHash}
                      className="flex items-center gap-5 rounded-2xl border border-border bg-card p-4"
                    >
                      <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-secondary">
                        <DownloadIcon className="size-6 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display font-semibold">{torrent.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">Saved in {torrent.savePath}</p>
                        <Progress value={percent} className="mt-3 h-1.5" />
                        <div className="mt-2 flex flex-wrap gap-5 text-xs text-muted-foreground">
                          <span>{formatBytes(torrent.downloaded)} / {formatBytes(torrent.length)}</span>
                          <span>{formatSpeed(torrent.downloadSpeed)}</span>
                          <span>{torrent.numPeers} peers</span>
                          <span>{torrent.state === "seeding" ? "Completed · seeding" : torrent.state}</span>
                          {torrent.length > 0 && <span>{percent.toFixed(0)}%</span>}
                        </div>
                      </div>
                      {torrent.state !== "seeding" && (
                        <button
                          onClick={() => void toggleTorrent(torrent)}
                          aria-label={torrent.state === "paused" ? `Resume ${torrent.name}` : `Pause ${torrent.name}`}
                          className="grid size-10 place-items-center rounded-full bg-secondary hover:bg-accent"
                        >
                          {torrent.state === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => void removeTorrent(torrent.infoHash)}
                        aria-label={`Stop ${torrent.name}`}
                        className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {sections.map(
            ([title, list]) =>
              list.length > 0 && (
                <section key={title} className="mt-10">
                <h2 className="mb-4 font-display text-lg font-semibold text-muted-foreground">
                  {title}
                </h2>
                <div className="space-y-3">
                  {list.map((item) => {
                    const percent = item.totalBytes
                      ? Math.min(100, (item.receivedBytes / item.totalBytes) * 100)
                      : 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-5 rounded-2xl border border-border bg-card p-4"
                      >
                        <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-secondary">
                          <DownloadIcon className="size-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display font-semibold">{item.title}</p>
                          {item.state === "downloading" || item.state === "queued" ? (
                            <>
                              <Progress value={percent} className="mt-3 h-1.5" />
                              <div className="mt-2 flex gap-5 text-xs text-muted-foreground">
                                <span>
                                  {formatBytes(item.receivedBytes)}
                                  {item.totalBytes ? ` / ${formatBytes(item.totalBytes)}` : ""}
                                </span>
                                {item.state === "downloading" && (
                                  <span>{formatSpeed(speedById[item.id] ?? 0)}</span>
                                )}
                                {item.totalBytes ? <span>{percent.toFixed(0)}%</span> : null}
                              </div>
                            </>
                          ) : (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              {item.state === "completed" ? (
                                <>
                                  <CheckCircle2 className="size-3.5 text-success" />
                                  Saved to {item.destinationPath}
                                </>
                              ) : item.state === "failed" ? (
                                (item.error ?? "Download failed")
                              ) : (
                                "Stopped · partial data kept when available"
                              )}
                            </p>
                          )}
                        </div>
                        {item.state === "downloading" || item.state === "queued" ? (
                          <button
                            onClick={() => void cancel(item.id)}
                            aria-label={`Cancel ${item.title}`}
                            className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-destructive"
                          >
                            <X className="size-4" />
                          </button>
                        ) : null}
                        {item.state === "cancelled" || item.state === "failed" ? (
                          <button
                            onClick={() => void resume(item.id)}
                            aria-label={`Resume ${item.title}`}
                            className="grid size-10 place-items-center rounded-full bg-secondary hover:bg-accent"
                          >
                            <Play className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                </section>
              ),
          )}
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function Row({
  d,
  onToggle,
  onCancel,
}: {
  d: Download;
  onToggle: (id: string) => void;
  onCancel: (id: string) => void;
}) {
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
              <span>
                {done.toFixed(1)} / {g.sizeGB} GB
              </span>
              <span>{d.state === "active" ? `${d.speedMBs} MB/s` : "Paused"}</span>
              {d.state === "active" && <span>{etaMin} min left</span>}
            </div>
          </>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {d.state === "completed" ? (
              <>
                <CheckCircle2 className="size-3.5 text-success" /> Installed · {g.sizeGB} GB
              </>
            ) : (
              `Waiting · ${g.sizeGB} GB`
            )}
          </p>
        )}
      </div>
      {live && (
        <button
          onClick={() => onToggle(d.id)}
          aria-label="Pause or resume"
          className="grid size-10 place-items-center rounded-full bg-secondary hover:bg-accent"
        >
          {d.state === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      )}
      {d.state !== "completed" && (
        <button
          onClick={() => onCancel(d.id)}
          aria-label="Cancel"
          className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
