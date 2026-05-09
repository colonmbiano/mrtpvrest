"use client";

/**
 * PrinterCategoriesModal — Asigna qué categorías del menú imprime/muestra
 * una impresora (o KDS virtual) específica. Escribe directo sobre
 * `Printer.categories[]` (legacy String[]) — el endpoint KDS hace UNION
 * con los Printer Groups, así que esta UI y la de Grupos coexisten.
 *
 * Flujo: tacos → Plancha, alitas → Freidora, bebidas → Barra. Cada
 * impresora tiene su propia lista; toggles M:N implícitos (la misma
 * categoría puede vivir en varias impresoras).
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Tag, Search } from "lucide-react";
import api from "@/lib/api";

interface Category {
  id: string;
  name: string;
}

interface PrinterRef {
  id: string;
  name: string;
  type: string;
  categories?: string[];
}

interface PrinterCategoriesModalProps {
  printer: PrinterRef;
  onClose: () => void;
  onSaved?: () => void;
}

export default function PrinterCategoriesModal({
  printer, onClose, onSaved,
}: PrinterCategoriesModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(
    () => new Set(printer.categories || [])
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [query, setQuery]     = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Category[]>("/api/menu/categories");
        if (cancelled) return;
        setCategories(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) toast.error("No pudimos cargar categorías");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === categories.length ? new Set() : new Set(categories.map((c) => c.id))
    );
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const tid = toast.loading("Guardando enrutamiento…");
    try {
      await api.put(
        `/api/printers/${printer.id}`,
        { categories: Array.from(selected) },
        { timeout: 15000 }
      );
      toast.success("Categorías asignadas", { id: tid });
      onSaved?.();
      onClose();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(
        "No se pudo guardar: " + (e.response?.data?.error || e.message || "fallo"),
        { id: tid }
      );
    } finally {
      setSaving(false);
    }
  }

  const filtered = query.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : categories;

  const stationLabel: Record<string, string> = {
    KITCHEN: "Cocina",
    BAR:     "Barra",
    GRILL:   "Plancha",
    FRYER:   "Freidora",
    CASHIER: "Caja",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0a0a0c] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-start">
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-amber-500 block mb-1.5">
              Enrutamiento por impresora
            </span>
            <h2 className="text-xl font-black text-white tracking-tight">{printer.name}</h2>
            <p className="text-[11px] font-bold text-zinc-500 mt-1">
              Estación: {stationLabel[printer.type] || printer.type} · {selected.size} categoría{selected.size !== 1 ? "s" : ""} asignada{selected.size !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-zinc-400 hover:text-white active:scale-95 transition-all disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Búsqueda + select all */}
        <div className="px-6 pt-5 pb-3 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoría…"
              className="w-full h-11 bg-[#121316] border border-white/5 rounded-xl pl-10 pr-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="button"
            onClick={toggleAll}
            disabled={categories.length === 0}
            className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest text-zinc-300 hover:text-white active:scale-95 disabled:opacity-40"
          >
            {selected.size === categories.length && categories.length > 0
              ? "Desmarcar todo"
              : "Marcar todo"}
          </button>
        </div>

        {/* Categorías */}
        <div className="flex-1 overflow-y-auto px-6 pb-5 scrollbar-hide">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 mx-auto border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-4">Cargando categorías…</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="py-12 text-center">
              <Tag size={32} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-sm font-bold text-zinc-400">Aún no hay categorías de menú</p>
              <p className="text-[11px] text-zinc-600 mt-1">Créalas desde /admin/menu antes de enrutarlas.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-zinc-600 text-sm font-bold py-8">Sin coincidencias</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {filtered.map((c) => {
                const active = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    disabled={saving}
                    className="flex items-center gap-2 p-3 rounded-xl border transition-all active:scale-95 text-left disabled:opacity-50"
                    style={{
                      background:  active ? "rgba(255,184,77,0.10)" : "#121316",
                      borderColor: active ? "#ffb84d"               : "rgba(255,255,255,0.05)",
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: active ? "#ffb84d" : "rgba(255,255,255,0.10)" }}
                    />
                    <span className="text-[12px] font-black text-white truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex gap-3 bg-[#0a0a0c]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-12 rounded-2xl bg-zinc-900 text-zinc-400 font-bold uppercase text-xs tracking-widest hover:text-white disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-[2] h-12 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-3 h-3 border-2 border-[#0a0a0c]/30 border-t-[#0a0a0c] rounded-full animate-spin" />
                Guardando…
              </>
            ) : (
              `Guardar (${selected.size})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
