import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, HardDrive } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AppSettings, StorageInfo } from "../../electron/shared.cjs";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · NEXUS" },
      {
        name: "description",
        content: "Configure downloads, installation, appearance and notifications.",
      },
      { property: "og:title", content: "Settings · NEXUS" },
      { property: "og:description", content: "Configure your NEXUS launcher." },
    ],
  }),
  component: SettingsPage,
});

const sections = [
  "General",
  "Downloads",
  "Game installation",
  "Appearance",
  "Notifications",
  "About",
] as const;

function Item({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-5 last:border-0">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const Folder = ({ path }: { path: string }) => (
  <div className="flex items-center gap-2">
    <code className="rounded-lg bg-secondary px-3 py-2 text-xs">{path}</code>
    <Button variant="secondary" size="sm">
      <FolderOpen /> Browse
    </Button>
  </div>
);

function SettingsPage() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(window.nexus)), []);
  return isDesktop ? <DesktopSettingsPage /> : <MockSettingsPage />;
}

function MockSettingsPage() {
  const [tab, setTab] = useState<(typeof sections)[number]>("General");
  const body: Record<string, ReactNode> = {
    General: (
      <>
        <Item label="Launch on startup" hint="Start NEXUS when Windows starts">
          <Switch defaultChecked />
        </Item>
        <Item label="Minimize to tray">
          <Switch />
        </Item>
        <Item label="Language">
          <Select defaultValue="en">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
            </SelectContent>
          </Select>
        </Item>
      </>
    ),
    Downloads: (
      <>
        <Item label="Download directory">
          <Folder path="D:\Nexus\Downloads" />
        </Item>
        <Item label="Limit bandwidth">
          <Switch />
        </Item>
        <Item label="Download while playing">
          <Switch defaultChecked />
        </Item>
      </>
    ),
    "Game installation": (
      <>
        <Item label="Installation directory">
          <Folder path="D:\Games\Nexus" />
        </Item>
        <Item label="Auto-update games">
          <Switch defaultChecked />
        </Item>
      </>
    ),
    Appearance: (
      <>
        <Item label="Theme">
          <Select defaultValue="dark">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Midnight</SelectItem>
              <SelectItem value="oled">OLED black</SelectItem>
            </SelectContent>
          </Select>
        </Item>
        <Item label="Animations">
          <Switch defaultChecked />
        </Item>
      </>
    ),
    Notifications: (
      <>
        <Item label="Download complete">
          <Switch defaultChecked />
        </Item>
        <Item label="Game updates">
          <Switch defaultChecked />
        </Item>
        <Item label="New releases">
          <Switch />
        </Item>
      </>
    ),
    About: (
      <>
        <Item label="Version">
          <span className="text-muted-foreground">0.1.0 (MVP)</span>
        </Item>
        <Item label="Updates">
          <Button variant="secondary" size="sm">
            Check for updates
          </Button>
        </Item>
      </>
    ),
  };
  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Settings</h1>
      <div className="mt-8 grid grid-cols-[220px_1fr] gap-10">
        <nav className="flex flex-col gap-1">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={cn(
                "rounded-xl px-4 py-2.5 text-left text-sm font-medium",
                tab === s
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="max-w-3xl rounded-2xl border border-border bg-card px-6">{body[tab]}</div>
      </div>
    </div>
  );
}

function DesktopSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [version, setVersion] = useState("");
  const [tab, setTab] = useState<"Downloads" | "Game installation" | "Storage" | "About">(
    "Downloads",
  );

  useEffect(() => {
    void Promise.all([
      window.nexus!.getSettings(),
      window.nexus!.getStorageInfo(),
      window.nexus!.getAppVersion(),
    ])
      .then(([currentSettings, currentStorage, currentVersion]) => {
        setSettings(currentSettings);
        setStorage(currentStorage);
        setVersion(currentVersion);
      })
      .catch(() => toast.error("Could not load desktop settings"));
  }, []);

  const chooseLocation = async (kind: "download" | "install") => {
    if (!settings) return;
    try {
      const selected = await window.nexus!.chooseDirectory(kind);
      if (!selected) return;
      const updated = await window.nexus!.saveSettings({
        ...settings,
        [kind === "download" ? "downloadDirectory" : "installDirectory"]: selected,
      });
      setSettings(updated);
      setStorage(await window.nexus!.getStorageInfo());
      toast.success("Folder setting saved");
    } catch {
      toast.error("Could not save that folder");
    }
  };

  const content: Record<typeof tab, ReactNode> = {
    Downloads: (
      <SettingLine label="Download directory" hint="Where direct downloads are saved.">
        <PathButton
          path={settings?.downloadDirectory}
          onClick={() => void chooseLocation("download")}
        />
      </SettingLine>
    ),
    "Game installation": (
      <SettingLine
        label="Default game directory"
        hint="Suggested location for your installed games."
      >
        <PathButton
          path={settings?.installDirectory}
          onClick={() => void chooseLocation("install")}
        />
      </SettingLine>
    ),
    Storage: (
      <SettingLine
        label="Available storage"
        hint={settings?.installDirectory ?? "Game installation directory"}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="size-4" />
          {storage?.freeBytes != null
            ? `${formatBytes(storage.freeBytes)} free of ${formatBytes(storage.totalBytes ?? 0)}`
            : "Storage information unavailable"}
        </div>
      </SettingLine>
    ),
    About: (
      <SettingLine label="Version">
        <span className="text-muted-foreground">{version || "Loading…"}</span>
      </SettingLine>
    ),
  };

  return (
    <div className="px-12 pt-24 pb-16">
      <h1 className="font-display text-4xl font-bold">Settings</h1>
      <div className="mt-8 grid grid-cols-[220px_1fr] gap-10">
        <nav className="flex flex-col gap-1">
          {(["Downloads", "Game installation", "Storage", "About"] as const).map((section) => (
            <button
              key={section}
              onClick={() => setTab(section)}
              className={cn(
                "rounded-xl px-4 py-2.5 text-left text-sm font-medium",
                tab === section
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {section}
            </button>
          ))}
        </nav>
        <div className="max-w-3xl rounded-2xl border border-border bg-card px-6">
          {content[tab]}
        </div>
      </div>
    </div>
  );
}

function SettingLine({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-5 last:border-0">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function PathButton({ path, onClick }: { path: string | undefined; onClick: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <code className="max-w-[420px] truncate rounded-lg bg-secondary px-3 py-2 text-xs">
        {path ?? "Loading…"}
      </code>
      <Button variant="secondary" size="sm" onClick={onClick}>
        <FolderOpen />
        Browse
      </Button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
