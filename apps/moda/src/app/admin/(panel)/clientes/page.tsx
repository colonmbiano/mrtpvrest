"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, RefreshCcw, Crown, Star, Repeat, Clock, RefreshCw, Search, type LucideIcon,
} from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { StatCard, DataCard, StatusBadge, TablePagination, Donut, EmptyState } from "@/components/admin/atoms";
import { money, num } from "@/lib/admin-format";
import api from "@/lib/admin-api";
import { ADMIN_KEYS } from "@/lib/admin-auth";

const PAGE_SIZE = 10;

type RetailSale = {
  id: string;
  folio: string;
  status: string;
  total: number | string;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: string;
};

type ClientRow = {
  key: string;
  name: string;
  contact: string;
  tickets: number;
  spent: number;
  lastIso: string;
  segment: "VIP" | "Frecuente" | "Nuevo";
};

const segColor: Record<ClientRow["segment"], string> = {
  VIP: "#16a34a",
  Frecuente: "#4ade80",
  Nuevo: "#86efac",
};
const segIcon: Record<ClientRow["segment"], LucideIcon> = {
  VIP: Crown,
  Frecuente: Repeat,
  Nuevo: Star,
};

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
};

export default function ClientesPage() {
  const [sales, setSales] = useState<RetailSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const locationId = typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEYS.locationId) : "";
    const qs = new URLSearchParams({ limit: "200" });
    if (locationId) qs.set("locationId", locationId);
    try {
      const res = await api.get<RetailSale[]>(`/api/retail/v1/sales?${qs.toString()}`);
      setSales(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("locationChanged", refresh);
    return () => window.removeEventListener("locationChanged", refresh);
  }, [load]);

  const allClients = useMemo<ClientRow[]>(() => {
    const map = new Map<string, { name: string; contact: string; tickets: number; spent: number; lastIso: string }>();
    for (const s of sales) {
      if (s.status !== "COMPLETED") continue;
      const rawName = (s.customerName || "").trim();
      const rawPhone = (s.customerPhone || "").trim();
      if (!rawName && !rawPhone) continue;
      const key = (rawPhone || rawName).toLowerCase();
      const cur = map.get(key) || {
        name: rawName || rawPhone,
        contact: rawPhone || "Mostrador",
        tickets: 0,
        spent: 0,
        lastIso: s.createdAt,
      };
      cur.tickets += 1;
      cur.spent += Number(s.total || 0);
      if (s.createdAt > cur.lastIso) cur.lastIso = s.createdAt;
      if (!cur.name && rawName) cur.name = rawName;
      if (cur.contact === "Mostrador" && rawPhone) cur.contact = rawPhone;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([key, c]): ClientRow => {
        const segment: ClientRow["segment"] =
          c.tickets >= 4 || c.spent >= 2500 ? "VIP" : c.tickets >= 2 ? "Frecuente" : "Nuevo";
        return { key, ...c, segment };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [sales]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allClients;
    return allClients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q),
    );
  }, [allClients, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const kpi = useMemo(() => {
    const total = allClients.length;
    const recurrent = allClients.filter((c) => c.tickets >= 2).length;
    const vip = allClients.filter((c) => c.segment === "VIP").length;
    const nuevos = allClients.filter((c) => c.segment === "Nuevo").length;
    const rate = total > 0 ? ((recurrent / total) * 100).toFixed(1) + "%" : "0%";
    return { total, recurrent, vip, nuevos, rate };
  }, [allClients]);

  const segments = useMemo(() => {
    const total = allClients.length || 1;
    const order: ClientRow["segment"][] = ["VIP", "Frecuente", "Nuevo"];
    return order.map((label) => {
      const count = allClients.filter((c) => c.segment === label).length;
      const pct = allClients.length > 0 ? Math.round((count / total) * 1000) / 10 : 0;
      return { label, count, pct, color: segColor[label] };
    });
  }, [allClients]);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar
        title="Clientes"
        subtitle="Clientes identificados en tus ventas de mostrador."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} tone="green" title="Total clientes" value={loading ? "—" : num(kpi.total)} />
        <StatCard icon={UserPlus} tone="green" title="Clientes de 1 compra" value={loading ? "—" : num(kpi.nuevos)} />
        <StatCard icon={RefreshCcw} tone="green" title="Tasa de recompra" value={loading ? "—" : kpi.rate} />
        <StatCard icon={Crown} tone="orange" title="Clientes VIP" value={loading ? "—" : num(kpi.vip)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DataCard
          title="Clientes registrados en ventas"
          action={
            <div className="flex items-center gap-2">
              <label className="flex h-9 items-center gap-2 rounded-lg border bg-[var(--surf-1)] px-2.5 text-[12px]" style={{ borderColor: "var(--bd-1)" }}>
                <Search size={13} className="text-[var(--tx-dim)]" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Buscar nombre o teléfono…"
                  className="w-40 bg-transparent text-[var(--tx-hi)] outline-none placeholder:text-[var(--tx-dim)]"
                />
              </label>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold text-[var(--tx-mut)] disabled:opacity-50"
                style={{ borderColor: "var(--bd-1)" }}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
              </button>
            </div>
          }
        >
          {loading ? (
            <EmptyState icon={RefreshCw} title="Cargando clientes…" hint="Consultando historial de ventas de tu tienda." />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Clock}
              title={query ? "Sin coincidencias" : "Aún no hay clientes identificados"}
              hint={
                query
                  ? "Prueba con otro nombre o teléfono."
                  : "Cuando captures el nombre o teléfono del cliente al cobrar en el POS, aparecerá aquí con su historial y nivel."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                      <th className="py-2.5 pr-3">Cliente</th>
                      <th className="py-2.5 pr-3">Contacto</th>
                      <th className="py-2.5 pr-3">Compras</th>
                      <th className="py-2.5 pr-3">Última compra</th>
                      <th className="py-2.5 pr-3">Total gastado</th>
                      <th className="py-2.5">Segmento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((c) => {
                      const initials = c.name
                        .split(" ")
                        .filter(Boolean)
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "CL";
                      return (
                        <tr key={c.key} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                                style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}
                              >
                                {initials}
                              </span>
                              <span className="truncate font-semibold text-[var(--tx-hi)]">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--tx-mut)]">{c.contact}</td>
                          <td className="tnum py-2.5 pr-3 font-semibold text-[var(--tx-hi)]">{num(c.tickets)}</td>
                          <td className="py-2.5 pr-3 text-[var(--tx-mut)]">{fmtDate(c.lastIso)}</td>
                          <td className="tnum py-2.5 pr-3 font-bold text-[var(--tx-hi)]">{money(c.spent)}</td>
                          <td className="py-2.5">
                            <StatusBadge status={c.segment} label={c.segment} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TablePagination
                info={`Mostrando ${(page - 1) * PAGE_SIZE + 1} a ${Math.min(page * PAGE_SIZE, filtered.length)} de ${num(filtered.length)} clientes`}
                page={page}
                totalPages={totalPages}
                onPage={setPage}
              />
            </>
          )}
        </DataCard>

        <div className="space-y-4">
          <DataCard title="Segmentos de clientes">
            <ul className="space-y-3">
              {segments.map((s) => {
                const Icon = segIcon[s.label] || Users;
                return (
                  <li key={s.label}>
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="flex items-center gap-2 text-[var(--tx-hi)]">
                        <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: "var(--surf-2)", color: s.color }}>
                          <Icon size={13} />
                        </span>
                        {s.label}
                      </span>
                      <span className="text-[var(--tx-mut)]">
                        <span className="tnum font-semibold text-[var(--tx-hi)]">{num(s.count)}</span> · {s.pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surf-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </DataCard>

          <DataCard title="Distribución de recompra">
            {allClients.length === 0 ? (
              <p className="text-[13px] text-[var(--tx-mut)]">Sin datos de clientes identificados en el periodo.</p>
            ) : (
              <div className="flex items-center gap-4">
                <Donut
                  size={130}
                  segments={segments.map((r) => ({ label: r.label, value: r.pct, color: r.color }))}
                  center={
                    <span>
                      <span className="tnum block text-[18px] font-extrabold text-[var(--tx-hi)]">{kpi.rate}</span>
                      <span className="block text-[9px] text-[var(--tx-mut)]">recompra</span>
                    </span>
                  }
                />
                <ul className="flex-1 space-y-2">
                  {segments.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="flex items-center gap-2 text-[var(--tx-mut)]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        {r.label}
                      </span>
                      <span className="tnum font-semibold text-[var(--tx-hi)]">{r.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DataCard>
        </div>
      </div>
    </div>
  );
}
