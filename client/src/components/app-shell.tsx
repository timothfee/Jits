import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Wordmark } from "./logo";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Library as LibraryIcon,
  Users,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Menu,
  X,
  ScanLine,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const NAV = [
  { path: "/", label: "Library", icon: LibraryIcon },
  { path: "/instructors", label: "Instructors", icon: Users },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
];

function useSearchParam(): [string, (v: string) => void] {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(
    location.includes("?") ? location.split("?")[1] : ""
  );
  const q = params.get("q") || "";
  const setQ = (v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set("q", v);
    else p.delete("q");
    const base = location.split("?")[0];
    setLocation(base + (p.toString() ? `?${p.toString()}` : ""));
  };
  return [q, setQ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useSearchParam();
  const [searchInput, setSearchInput] = useState(q);
  const qc = useQueryClient();
  const { toast } = useToast();

  const stats = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(apiUrl(queryKey.join("/")));
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/instructionals/scan"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({
        title: "Library scan complete",
        description: `Added ${data.added} • Updated ${data.updated} • Missing ${data.missing}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchInput.trim());
  };

  const isActive = (p: string) =>
    p === "/" ? location === "/" || location.startsWith("/?") : location.startsWith(p);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static z-40 inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200`}
      >
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
          <Link href="/" onClick={() => setMobileOpen(false)}>
            <Wordmark />
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-sidebar-accent/60 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Library
              </div>
              <div className="font-display font-bold text-lg leading-tight">
                {stats.data?.total ?? "—"}
              </div>
            </div>
            <div className="rounded-md bg-sidebar-accent/60 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Watched
              </div>
              <div className="font-display font-bold text-lg leading-tight">
                {stats.data?.watched ?? "—"}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            <ScanLine className="size-4" />
            {scanMutation.isPending ? "Scanning…" : "Scan library"}
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 border-b border-border flex items-center gap-3 px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <form onSubmit={onSearch} className="flex-1 max-w-xl relative">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search instructionals, instructors, files…"
              className="pr-8"
              data-testid="input-search"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Search"
            >
              <ScanLine className="size-4 rotate-90 opacity-60" />
            </button>
          </form>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
