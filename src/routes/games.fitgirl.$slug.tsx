import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFitGirlGameDetail } from "@/lib/gameCatalog.functions";
import type { LibraryGame } from "../../electron/shared.cjs";

export const Route = createFileRoute("/games/fitgirl/$slug")({
  loader: async ({ params }) => {
    const detail = await getFitGirlGameDetail({ data: { slug: params.slug } });
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

function FitGirlGameDetails() {
  const { detail } = Route.useLoaderData();
  const [isDesktop, setIsDesktop] = useState(false);
  const [libraryGame, setLibraryGame] = useState<LibraryGame | null>(null);
  const [busy, setBusy] = useState(false);

  const torrent = detail.torrents[0] ?? null;

  useEffect(() => {
    if (!window.nexus) return;
    setIsDesktop(true);
    void window.nexus.getLibrary().then((lib) => {
      const found = lib.find(
        (g) => g.title.toLowerCase() === detail.title.toLowerCase(),
      );
      setLibraryGame(found ?? null);
    });
  }, [detail.title]);

  const handleDownload = async () => {
    if (!torrent) {
      toast.error("No torrent link was found on the FitGirl page.");
      return;
    }
    setBusy(true);
    try {
      if (isDesktop && !libraryGame && window.nexus) {
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
      }

      if (isDesktop && window.nexus) {
        await window.nexus.openTorrent(torrent.url);
      } else {
        // Web: trigger protocol handler through a real <a> click.
        const anchor = document.createElement("a");
        anchor.href = torrent.url;
        anchor.rel = "noreferrer noopener";
        anchor.click();
      }
      toast.success("Opening in your torrent client…");
    } catch (err) {
      console.error(err);
      toast.error("Could not open the torrent link.");
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    if (!isDesktop || !libraryGame || !window.nexus) return;
    if (!confirm(`Remove "${detail.title}" from your library?`)) return;
    setBusy(true);
    try {
      await window.nexus.removeGame(libraryGame.id);
      setLibraryGame(null);
      toast.success("Removed from library");
    } catch {
      toast.error("Failed to remove from library");
    } finally {
      setBusy(false);
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
            <Button
              size="lg"
              className="rounded-full px-8"
              onClick={handleDownload}
              disabled={busy || !torrent}
            >
              <Download /> {libraryGame ? "Download again" : "Download torrent"}
            </Button>
            {libraryGame && (
              <Button
                size="lg"
                variant="secondary"
                className="rounded-full px-8"
                onClick={handleUninstall}
                disabled={busy}
              >
                <Trash2 /> Uninstall
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