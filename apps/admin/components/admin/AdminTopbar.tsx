"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Menu, CornerDownLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import { NAV_TOP, NAV_GROUPS, routeTitle } from "@/lib/nav";
import type { AdminUser } from "@/types/admin";

type SearchEntry = { href: string; label: string; group?: string; subtitle?: string };

const SEARCH_INDEX: SearchEntry[] = [
  ...NAV_TOP.map((item) => ({ href: item.href, label: item.label, subtitle: item.subtitle })),
  ...NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ href: item.href, label: item.label, group: group.label, subtitle: item.subtitle })),
  ),
];

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Header superior del admin (desktop): título/breadcrumb de la página actual
 * (desde lib/nav.ts), buscador de navegación con atajo ⌘/Ctrl-K, campana de
 * notificaciones y avatar del usuario.
 */
export default function AdminTopbar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUser(getUser() as AdminUser | null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setQuery("");
    setFocused(false);
  }, [pathname]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return SEARCH_INDEX.filter((entry) =>
      normalize(`${entry.label} ${entry.group ?? ""} ${entry.subtitle ?? ""}`).includes(q),
    ).slice(0, 7);
  }, [query]);

  useEffect(() => setHighlight(0), [results.length, query]);

  const current = routeTitle(pathname);
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "AD";

  function go(href: string) {
    setQuery("");
    setFocused(false);
    searchRef.current?.blur();
    router.push(href);
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) {
      if (e.key === "Escape") searchRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[highlight] ?? results[0];
      if (target) go(target.href);
    } else if (e.key === "Escape") {
      setQuery("");
      searchRef.current?.blur();
    }
  }

  const showResults = focused && query.trim().length > 0;

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 px-4 py-3 md:px-8"
      style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--bd-1)" }}
    >
      {onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl md:hidden"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx-mid)" }}
        >
          <Menu size={18} />
        </button>
      )}

      {/* Título / breadcrumb de la página actual */}
      <div className="hidden min-w-0 shrink-0 md:block md:max-w-[300px] lg:max-w-[380px]">
        {current ? (
          <>
            <div className="truncate text-[10px] font-bold uppercase tracking-widest text-tx-dim">
              {current.group ?? "Panel"}
            </div>
            <div className="truncate font-display text-[15px] font-extrabold leading-tight text-tx-hi">
              {current.title}
            </div>
          </>
        ) : (
          <div className="font-display text-[15px] font-extrabold leading-tight text-tx-hi">Panel</div>
        )}
      </div>

      {/* Buscador de navegación */}
      <div className="relative hidden min-w-0 flex-1 md:block">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tx-dim" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Buscar secciones del panel"
          placeholder="Buscar en el panel… (inventario, nómina, cupones)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onSearchKey}
          className="h-11 w-full max-w-xl rounded-xl pl-10 pr-16 text-sm outline-none transition-colors"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
        />
        <kbd
          className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tx-dim lg:block"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          ⌘K
        </kbd>

        {showResults && (
          <div
            className="absolute left-0 top-[52px] z-30 w-full max-w-xl overflow-hidden rounded-ds-lg p-1 shadow-card-lg"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
          >
            {results.length === 0 ? (
              <div className="px-3 py-3 text-xs text-tx-mut">Sin resultados para “{query.trim()}”</div>
            ) : (
              results.map((entry, index) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(entry.href);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ background: index === highlight ? "var(--accent-soft)" : "transparent" }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-tx">{entry.label}</span>
                    <span className="block truncate text-[11px] text-tx-mut">
                      {[entry.group, entry.subtitle].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {index === highlight && <CornerDownLeft size={14} className="shrink-0 text-tx-dim" />}
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx-mid)" }}
        >
          <Bell size={18} />
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full"
            style={{ background: "var(--err)", boxShadow: "0 0 0 2px var(--surf-1)" }}
          />
        </button>
        <div className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-3" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold"
            style={{ background: "linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))", color: "var(--accent-contrast)" }}
          >
            {initials}
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate text-[12px] font-bold text-tx-hi">{user?.name || "Admin"}</div>
            <div className="truncate text-[10px] text-tx-mut">{user?.email || ""}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
