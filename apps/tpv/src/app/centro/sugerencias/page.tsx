"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, MessageCircle, ShoppingCart, Zap, Clock, X, Plus, Minus } from "lucide-react";
import api from "@/lib/api";

type Urgency = "URGENTE" | "PRONTO";

interface SuggestionItem {
  ingredient: { id: string; name: string; stock: number; minStock: number; unit: string; baseUnit: string };
  supplier: { id: string; name: string; phone: string; leadTimeDays: number; minOrderAmount: number } | null;
  dailyAvgConsumption: number;
  daysOfStock: number | null;
  leadTimeDays: number;
  urgency: Urgency;
  qtySuggestedBase: number;
  qtySuggestedPurchase: number;
  purchaseUnit: string | null;
  unitPrice: number;
  lineTotal: number;
}

interface SupplierGroup {
  supplier: SuggestionItem["supplier"];
  items: SuggestionItem[];
  urgentCount: number;
  totalAmount: number;
  belowMinOrder: boolean;
}

interface ApiResponse {
  suggestions: SupplierGroup[];
  generatedAt: string;
  windowDays: number;
  safetyDays: number;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function CentroSugerenciasPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  // Overrides locales para qty editable y items quitados
  const [overrides, setOverrides] = useState<Record<string, { qty?: number; removed?: boolean }>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<ApiResponse>("/api/inventory/purchase-suggestions");
        setData(data);
        if (data.suggestions.length > 0 && !selectedSupplierId) {
          setSelectedSupplierId(data.suggestions[0]?.supplier?.id ?? "__NO_SUPPLIER__");
        }
      } catch (e: any) {
        setError(e?.response?.data?.error || e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedGroup = useMemo(() => {
    if (!data || !selectedSupplierId) return null;
    return data.suggestions.find((g) => (g.supplier?.id ?? "__NO_SUPPLIER__") === selectedSupplierId) || null;
  }, [data, selectedSupplierId]);

  const editedItems = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.items
      .filter((it) => !overrides[it.ingredient.id]?.removed)
      .map((it) => ({
        ...it,
        qtySuggestedPurchase: overrides[it.ingredient.id]?.qty ?? it.qtySuggestedPurchase,
        lineTotal: (overrides[it.ingredient.id]?.qty ?? it.qtySuggestedPurchase) * it.unitPrice,
      }));
  }, [selectedGroup, overrides]);

  const editedTotal = editedItems.reduce((s, it) => s + it.lineTotal, 0);

  const sendWhatsApp = () => {
    if (!selectedGroup || editedItems.length === 0) return;
    const supplier = selectedGroup.supplier;
    const phone = (supplier?.phone || "").replace(/[^\d+]/g, "");
    const lines = editedItems.map((it) => {
      const unit = it.purchaseUnit || it.ingredient.unit;
      return `• ${it.qtySuggestedPurchase} ${unit} de ${it.ingredient.name}`;
    });
    const text = encodeURIComponent(
      `Hola${supplier?.name ? " " + supplier.name : ""}, te pido por favor:\n\n` +
      lines.join("\n") +
      `\n\nTotal estimado: ${fmtMoney(editedTotal)}\nGracias!`
    );
    // Si no hay número, lanzamos wa.me sin número para que el usuario lo elija
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    if (typeof window !== "undefined") window.open(url, "_blank");
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-center">
        <AlertTriangle className="mx-auto mb-3" size={22} />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Loader2 className="animate-spin mb-3" size={26} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Calculando sugerencias…</span>
      </div>
    );
  }
  if (data.suggestions.length === 0) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-10 text-center text-white/40 max-w-2xl mx-auto">
        <ShoppingCart size={28} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-semibold">Sin sugerencias por ahora.</p>
        <p className="text-[11px] mt-1">
          Tus ingredientes tienen stock suficiente para más de leadTime + 2 días.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-4">
      {/* Lista de proveedores */}
      <section className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-[11px] font-black tracking-[0.25em] text-white/50 uppercase">Proveedores</h3>
          <span className="text-[10px] font-black text-white/30">{data.suggestions.length}</span>
        </header>
        <ul className="divide-y divide-white/5 max-h-[70vh] overflow-auto">
          {data.suggestions.map((g) => {
            const key = g.supplier?.id ?? "__NO_SUPPLIER__";
            const active = key === selectedSupplierId;
            return (
              <li key={key}>
                <button
                  onClick={() => { setSelectedSupplierId(key); setOverrides({}); }}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-white/5 active:bg-white/10 ${active ? "bg-white/[0.06]" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {g.supplier?.name || "Sin proveedor asignado"}
                    </div>
                    <div className="text-[11px] text-white/40 tabular-nums">
                      {g.items.length} item{g.items.length === 1 ? "" : "s"} · {fmtMoney(g.totalAmount)}
                    </div>
                  </div>
                  {g.urgentCount > 0 && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[9px] font-black uppercase tracking-widest">
                      <Zap size={9} /> {g.urgentCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Detalle */}
      <section className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex flex-col">
        {!selectedGroup ? (
          <div className="flex-1 flex items-center justify-center text-center p-10 text-white/40">
            <p className="text-sm max-w-sm">Selecciona un proveedor para revisar la PO sugerida.</p>
          </div>
        ) : (
          <>
            <header className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white">
                  {selectedGroup.supplier?.name || "Sin proveedor asignado"}
                </h2>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Lead time {selectedGroup.supplier?.leadTimeDays ?? 3}d ·
                  {" "}{editedItems.length} item{editedItems.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white tabular-nums">{fmtMoney(editedTotal)}</div>
                {selectedGroup.supplier?.minOrderAmount && editedTotal < selectedGroup.supplier.minOrderAmount && (
                  <div className="text-[10px] font-bold text-amber-300 mt-0.5">
                    Por debajo del mínimo ({fmtMoney(selectedGroup.supplier.minOrderAmount)})
                  </div>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-auto">
              {editedItems.length === 0 ? (
                <div className="p-10 text-center text-white/40 text-sm">
                  No quedan items en esta sugerencia (los quitaste todos).
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {editedItems.map((it) => {
                    const o = overrides[it.ingredient.id];
                    const qty = o?.qty ?? it.qtySuggestedPurchase;
                    return (
                      <li key={it.ingredient.id} className="px-5 py-3 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">{it.ingredient.name}</span>
                            {it.urgency === "URGENTE" ? (
                              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[9px] font-black uppercase tracking-widest">
                                <Zap size={9} /> Urgente
                              </span>
                            ) : (
                              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[9px] font-black uppercase tracking-widest">
                                <Clock size={9} /> Pronto
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/40 tabular-nums mt-0.5">
                            Stock {it.ingredient.stock} {it.ingredient.unit}
                            {it.daysOfStock != null && ` · ${it.daysOfStock.toFixed(1)}d cobertura`}
                            {" · "}{fmtMoney(it.unitPrice)} / {it.purchaseUnit || it.ingredient.unit}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setOverrides((p) => ({
                              ...p,
                              [it.ingredient.id]: { ...p[it.ingredient.id], qty: Math.max(1, qty - 1) },
                            }))}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95"
                            aria-label="Restar"
                          >
                            <Minus size={12} className="text-white/70" />
                          </button>
                          <input
                            type="number"
                            value={qty}
                            min={1}
                            onChange={(e) => {
                              const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                              setOverrides((p) => ({
                                ...p,
                                [it.ingredient.id]: { ...p[it.ingredient.id], qty: v },
                              }));
                            }}
                            className="w-12 px-1 py-1 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white text-center tabular-nums focus:outline-none focus:border-amber-400/60"
                          />
                          <button
                            onClick={() => setOverrides((p) => ({
                              ...p,
                              [it.ingredient.id]: { ...p[it.ingredient.id], qty: qty + 1 },
                            }))}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95"
                            aria-label="Sumar"
                          >
                            <Plus size={12} className="text-white/70" />
                          </button>
                        </div>
                        <div className="w-20 text-right text-sm font-black text-white tabular-nums">
                          {fmtMoney(qty * it.unitPrice)}
                        </div>
                        <button
                          onClick={() => setOverrides((p) => ({
                            ...p,
                            [it.ingredient.id]: { ...p[it.ingredient.id], removed: true },
                          }))}
                          className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-rose-500/15 hover:border-rose-500/30 active:scale-95"
                          aria-label="Quitar"
                        >
                          <X size={12} className="text-white/50" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
              <span className="text-[11px] text-white/40 mr-auto">
                {selectedGroup.supplier?.phone
                  ? `Se enviará a ${selectedGroup.supplier.phone}`
                  : "Se abrirá WhatsApp para que elijas el contacto"}
              </span>
              <button
                disabled={editedItems.length === 0}
                onClick={sendWhatsApp}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-black text-[#0a0a0c] bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
              >
                <MessageCircle size={14} strokeWidth={3} />
                Enviar PO por WhatsApp
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
