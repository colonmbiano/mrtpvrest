"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Shirt,
  Boxes,
  AlertTriangle,
  ReceiptText,
  ArrowRight,
  RefreshCw,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/admin-api";
import { money } from "@/lib/money";
import { ADMIN_KEYS } from "@/lib/admin-auth";

type Sku = { id: string; price: number; stockBalances?: { qty: number }[] };
type Product = { id: string; name: string; skus: Sku[] };
type StockRow = {
  id: string;
  qty: number;
  minQty: number;
  sku: { sku: string; size?: string | null; color?: string | null; product: { name: string } };
};
type Sale = {
  id: string;
  folio: string;
  total: number;
  status: string;
  createdAt: string;
  lines: { productName: string; quantity: number }[];
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationName, setLocationName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const locationId = typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEYS.locationId) : "";
    if (typeof window !== "undefined") setLocationName(localStorage.getItem(ADMIN_KEYS.locationName) || "");
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
    try {
      const [cat, stk, sal] = await Promise.all([
        api.get<{ products: Product[] }>(`/api/retail/v1/catalog${q}`),
        api.get<StockRow[]>(`/api/retail/v1/stock${q}`),
        api.get<Sale[]>(`/api/retail/v1/sales${q ? `${q}&limit=40` : "?limit=40"}`),
      ]);
      setProducts(cat.data.products || []);
      setStock(Array.isArray(stk.data) ? stk.data : []);
      setSales(Array.isArray(sal.data) ? sal.data : []);
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "No se pudo cargar el resumen",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const skuCount = products.reduce((n, p) => n + (p.skus?.length || 0), 0);
    const stockUnits = stock.reduce((n, r) => n + Number(r.qty || 0), 0);
    const lowStock = stock.filter((r) => Number(r.minQty) > 0 && Number(r.qty) <= Number(r.minQty));
    const today = todayKey();
    const salesToday = sales.filter((s) => s.status === "COMPLETED" && s.createdAt?.slice(0, 10) === today);
    const revenueToday = salesToday.reduce((n, s) => n + Number(s.total || 0), 0);
    return { skuCount, stockUnits, lowStock, revenueToday, salesTodayCount: salesToday.length };
  }, [products, stock, sales]);

  const recent = sales.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">MODA+ Admin</div>
          <h1
            className="mt-1.5 text-3xl font-black tracking-tight text-[var(--tx-hi)] md:text-4xl"
            style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
          >
            Resumen de tu tienda
          </h1>
          {locationName && <p className="mt-1 text-sm text-[var(--tx-mut)]">{locationName}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold text-[var(--tx-hi)] disabled:opacity-50"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
          <Link
            href="/admin/catalogo"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black text-[#06140d]"
            style={{ background: "var(--brand-primary)", boxShadow: "0 10px 30px var(--iris-glow)" }}
          >
            <PackagePlus size={16} /> Nuevo producto
          </Link>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-[var(--err)]/30 bg-[var(--err-soft)] px-4 py-3 text-sm font-semibold text-[var(--err)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ReceiptText} label="Ventas hoy" value={money(stats.revenueToday)} hint={`${stats.salesTodayCount} tickets`} />
        <Stat icon={Shirt} label="SKUs en catálogo" value={stats.skuCount.toLocaleString("es-MX")} />
        <Stat icon={Boxes} label="Piezas en stock" value={stats.stockUnits.toLocaleString("es-MX")} />
        <Stat
          icon={AlertTriangle}
          label="Bajo mínimo"
          value={stats.lowStock.length.toLocaleString("es-MX")}
          tone={stats.lowStock.length > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Stock bajo mínimo" href="/admin/catalogo" cta="Ver stock">
          {loading ? (
            <Skeleton />
          ) : stats.lowStock.length === 0 ? (
            <Empty text="Todo el stock está sobre su mínimo. 🎉" />
          ) : (
            <ul className="space-y-2">
              {stats.lowStock.slice(0, 6).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--tx-hi)]">{r.sku.product.name}</div>
                    <div className="truncate font-mono text-[11px] text-[var(--tx-mut)]">
                      {r.sku.sku} · {[r.sku.size, r.sku.color].filter(Boolean).join(" / ") || "única"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-black text-[var(--warn)]">{r.qty}</div>
                    <div className="font-mono text-[10px] text-[var(--tx-dim)]">min {r.minQty}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Ventas recientes" href="/admin/catalogo" cta="Ver ventas">
          {loading ? (
            <Skeleton />
          ) : recent.length === 0 ? (
            <Empty text="Aún no hay ventas. Las de la caja MODA+ aparecerán aquí." />
          ) : (
            <ul className="space-y-2">
              {recent.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--tx-hi)]">
                      {s.lines.map((l) => `${l.productName} ×${l.quantity}`).join(", ") || s.folio}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--tx-mut)]">
                      {s.folio} · {s.status === "COMPLETED" ? "Completada" : s.status}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-black text-[var(--tx-hi)]">{money(s.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "brand" | "warn" | "ok";
}) {
  const color = tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : "var(--brand-primary)";
  const soft = tone === "warn" ? "var(--warn-soft)" : tone === "ok" ? "var(--ok-soft)" : "var(--iris-soft)";
  return (
    <div className="rounded-3xl p-4" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
      <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: soft, color }}>
        <Icon size={19} strokeWidth={2} />
      </span>
      <div className="mt-3 font-mono text-2xl font-black leading-none text-[var(--tx-hi)]">{value}</div>
      <div className="mt-1.5 text-[11px] font-bold text-[var(--tx-mut)]">{label}</div>
      {hint && <div className="font-mono text-[10px] text-[var(--tx-dim)]">{hint}</div>}
    </div>
  );
}

function Card({ title, href, cta, children }: { title: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl p-4" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-black text-[var(--tx-hi)]">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--brand-primary)]">
          {cta} <ArrowRight size={13} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-[var(--tx-mut)]">{text}</p>;
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-2xl" style={{ background: "var(--surf-2)" }} />
      ))}
    </div>
  );
}
