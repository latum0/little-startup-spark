import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Compass, Download, Home, Library, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/library", label: "My Library", icon: Library },
  { to: "/downloads", label: "Downloads", icon: Download },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const consoleHome = path === "/" && typeof window !== "undefined" && Boolean(window.nexus);
  return (
    <div className="flex h-screen min-w-[1280px] overflow-hidden bg-background font-sans text-foreground">
      <aside
        className={`${consoleHome ? "hidden" : "flex"} w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6`}
      >
        <div className="mb-10 flex items-center gap-2 px-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
            N
          </div>
          <span className="font-display text-lg font-semibold tracking-[0.25em]">NEXUS</span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-[18px]", active && "text-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {!consoleHome && (
          <header className="absolute right-0 left-60 z-20 flex h-16 items-center justify-between px-10">
            <label className="flex w-80 items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm text-muted-foreground backdrop-blur">
              <Search className="size-4" />
              <input
                placeholder="Search games"
                className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-success" />
                Online
              </span>
              <button
                aria-label="Notifications"
                className="text-muted-foreground hover:text-foreground"
              >
                <Bell className="size-5" />
              </button>
              <div className="grid size-9 place-items-center rounded-full bg-primary/20 font-display text-sm font-semibold text-primary ring-2 ring-primary/40">
                MH
              </div>
            </div>
          </header>
        )}
        <main className={`flex-1 overflow-y-auto ${consoleHome ? "h-screen" : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
