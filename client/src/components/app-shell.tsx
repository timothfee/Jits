import { type ReactNode, useState, useRef, useEffect } from "react";
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
  ChevronRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const NAV = [
  { path: "/", label: "Library", icon: LibraryIcon },
  { path: "/instructors", label: "Instructors", icon: Users },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const stats = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(apiUrl(queryKey[0] as string));
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/instructionals/scan"),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data?.error) {
        toast({ title: "Scan found nothing", description: data.error, variant: "destructive" });
      } else {
        toast({
          title: "Library scan complete",
          description: `Added ${data.added} • Updated ${data.updated} • Missing ${data.missing}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const isActive = (p: string) =>
    p === "/" ? location === "/" || location.startsWith("/?") : location.startsWith(p);

  const currentNav = NAV.find((n) => isActive(n.path)) ?? NAV[0];
  const CurrentIcon = currentNav.icon;

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      {/* Top navbar */}
      <header className="h-16 shrink-0 border-b border-border flex items-center gap-3 px-4 md:px-6 z-30">
        {/* Nav dropdown trigger */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-accent/60 transition-colors text-sm font-medium"
            aria-label="Navigation menu"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <CurrentIcon className="size-4" />
              {currentNav.label}
            </span>
          </button>

          {/* Dropdown panel */}
          {menuOpen && (
            <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-border bg-popover shadow-xl overflow-hidden z-50">
              {/* Nav links */}
              <nav className="p-1.5">
                {NAV.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                      }`}
                    >
                      <Icon className="size-4" />
                      {item.label}
                      {active && <ChevronRight className="size-3.5 ml-auto opacity-50" />}
                    </Link>
                  );
                })}
              </nav>

              {/* Divider */}
              <div className="border-t border-border mx-3" />

              {/* Stats */}
              <div className="p-3 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/60 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Library</div>
                  <div className="font-display font-bold text-lg leading-tight">
                    {stats.data?.total ?? "—"}
                  </div>
                </div>
                <div className="rounded-md bg-muted/60 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Watched</div>
                  <div className="font-display font-bold text-lg leading-tight">
                    {stats.data?.watched ?? "—"}
                  </div>
                </div>
              </div>

              {/* Scan button */}
              <div className="px-3 pb-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => { scanMutation.mutate(); setMenuOpen(false); }}
                  disabled={scanMutation.isPending}
                >
                  <ScanLine className="size-4" />
                  {scanMutation.isPending ? "Scanning…" : "Scan library"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Wordmark */}
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <div className="flex-1" />

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
