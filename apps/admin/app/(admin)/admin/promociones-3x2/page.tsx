"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Plus, Trash2, Pencil, X, Layers } from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen,
  PageHeader,
  WtCard,
  Pill,
  PrimaryBtn,
  IconBadge,
  EmptyState,
  Toggle,
  LoadingCards,
} from "@/components/warmtech";

// ── Tipos ───────────────────────────────────────────────────────────────────
interface Category {
  id: string;
  name: string;
  isActive?: boolean;
}
interface PromoCategory {
  id: string;
  name: string | null;
}
interface BulkPromo {
  id: string;
  name: string;
  buyQuantity: number;
  payQuantity: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  categories: PromoCategory[];
}

// Forma del formulario (crear / editar).
interface FormState {
  id: string | null;
  name: string;
  buyQuantity: number;
  payQuantity: number;
  isActive: boolean;
  startsAt: string; // yyyy-mm-dd o ""
  endsAt: string;
  categoryIds: string[];
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  buyQuantity: 3,
  payQuantity: 2,
  isActive: true,
  startsAt: "",
  endsAt: "",
  categoryIds: [],
};

// Presets rápidos de NxM.
const PRESETS: { label: string; buy: number; pay: number }[] = [
  { label: "3x2", buy: 3, pay: 2 },
  { label: "2x1", buy: 2, pay: 1 },
  { label: "4x3", buy: 4, pay: 3 },
];

// Recorta una fecha ISO a yyyy-mm-dd para <input type=date>.
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function BulkPromosPage() {
  const [promos, setPromos] = useState<BulkPromo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null); // null = modal cerrado
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get<BulkPromo[]>("/api/bulk-promos"),
        api.get<Category[]>("/api/menu/categories"),
      ]);
      setPromos(p.data);
      setCategories(c.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al cargar promociones", false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => setForm({ ...EMPTY_FORM });
  const openEdit = (promo: BulkPromo) =>
    setForm({
      id: promo.id,
      name: promo.name,
      buyQuantity: promo.buyQuantity,
      payQuantity: promo.payQuantity,
      isActive: promo.isActive,
      startsAt: toDateInput(promo.startsAt),
      endsAt: toDateInput(promo.endsAt),
      categoryIds: promo.categories.map((c) => c.id),
    });

  const toggleCategory = (id: string) => {
    setForm((f) =>
      f
        ? {
            ...f,
            categoryIds: f.categoryIds.includes(id)
              ? f.categoryIds.filter((x) => x !== id)
              : [...f.categoryIds, id],
          }
        : f,
    );
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return showToast("Ponle un nombre a la promo", false);
    if (form.payQuantity >= form.buyQuantity)
      return showToast("Debes pagar menos de lo que se compra (ej. 3x2)", false);
    if (form.categoryIds.length === 0)
      return showToast("Elige al menos una categoría elegible", false);

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      buyQuantity: form.buyQuantity,
      payQuantity: form.payQuantity,
      isActive: form.isActive,
      categoryIds: form.categoryIds,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    };
    try {
      if (form.id) {
        await api.put(`/api/bulk-promos/${form.id}`, payload);
        showToast("Promo actualizada");
      } else {
        await api.post("/api/bulk-promos", payload);
        showToast("Promo creada");
      }
      setForm(null);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al guardar", false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (promo: BulkPromo) => {
    if (!window.confirm(`¿Eliminar la promo "${promo.name}"?`)) return;
    try {
      await api.delete(`/api/bulk-promos/${promo.id}`);
      showToast("Promo eliminada");
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al eliminar", false);
    }
  };

  // Activar/desactivar inline (optimista con recarga).
  const toggleActive = async (promo: BulkPromo) => {
    try {
      await api.put(`/api/bulk-promos/${promo.id}`, { isActive: !promo.isActive });
      setPromos((ps) =>
        ps.map((p) => (p.id === promo.id ? { ...p, isActive: !p.isActive } : p)),
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al cambiar estado", false);
    }
  };

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Promociones"
        title="Promos por cantidad (NxM)"
        subtitle="Compra N, paga M sobre categorías elegibles (ej. 3x2 en alitas y boneless). El descuento se aplica solo en el TPV; siempre se regala la pieza más barata."
        actions={
          <PrimaryBtn icon={Plus} full={false} onClick={openCreate}>
            Nueva promo
          </PrimaryBtn>
        }
      />

      {/* CTA en móvil (PageHeader es desktop-only) */}
      <div className="mb-4 md:hidden">
        <PrimaryBtn icon={Plus} onClick={openCreate}>
          Nueva promo
        </PrimaryBtn>
      </div>

      {loading ? (
        <LoadingCards count={3} />
      ) : promos.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin promociones NxM"
          hint="Crea un 3x2 en alitas y boneless: por cada 3 piezas, la más barata sale gratis."
          action={
            <PrimaryBtn icon={Plus} full={false} onClick={openCreate}>
              Crear la primera
            </PrimaryBtn>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {promos.map((promo) => (
            <WtCard key={promo.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <IconBadge icon={Tag} tone={promo.isActive ? "ac" : "neutral"} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-extrabold text-tx-hi">
                      {promo.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-tx-mut">
                      {promo.buyQuantity}x{promo.payQuantity} · paga {promo.payQuantity} de
                      cada {promo.buyQuantity}
                    </div>
                  </div>
                </div>
                <Pill tone={promo.isActive ? "ok" : "neutral"} live={promo.isActive}>
                  {promo.isActive ? "Activa" : "Pausada"}
                </Pill>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Layers size={13} className="text-tx-dim" />
                {promo.categories.length === 0 ? (
                  <span className="text-[12px] text-tx-mut">Sin categorías</span>
                ) : (
                  promo.categories.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full px-2 py-[3px] text-[11px] font-semibold"
                      style={{ background: "var(--surf-2)", color: "var(--tx)" }}
                    >
                      {c.name || "—"}
                    </span>
                  ))
                )}
              </div>

              <div className="mt-1 flex items-center justify-between border-t border-bd-2 pt-3">
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={promo.isActive}
                    onChange={() => toggleActive(promo)}
                    label="Activar promo"
                  />
                  <span className="text-[12px] text-tx-mut">
                    {promo.isActive ? "Activa" : "Pausada"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PrimaryBtn ghost full={false} icon={Pencil} onClick={() => openEdit(promo)}>
                    Editar
                  </PrimaryBtn>
                  <PrimaryBtn danger full={false} icon={Trash2} onClick={() => remove(promo)}>
                    <span className="sr-only">Eliminar</span>
                  </PrimaryBtn>
                </div>
              </div>
            </WtCard>
          ))}
        </div>
      )}

      {/* ── Modal crear / editar ─────────────────────────────────────────── */}
      {form && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6"
          onClick={() => !saving && setForm(null)}
        >
          <div
            className="warmtech-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[20px] p-5 md:rounded-[20px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-tx-hi">
                {form.id ? "Editar promo" : "Nueva promo NxM"}
              </h2>
              <button
                type="button"
                onClick={() => !saving && setForm(null)}
                className="grid h-9 w-9 place-items-center rounded-full text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Nombre */}
            <label className="mb-1 block text-[12px] font-semibold text-tx-mut">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="3x2 Alitas y Boneless"
              className="mb-4 w-full rounded-[12px] px-3 py-3 text-[14px] text-tx outline-none"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
            />

            {/* NxM */}
            <label className="mb-1 block text-[12px] font-semibold text-tx-mut">
              Mecánica (compra N, paga M)
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = form.buyQuantity === p.buy && form.payQuantity === p.pay;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setForm({ ...form, buyQuantity: p.buy, payQuantity: p.pay })}
                    className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-transform active:scale-95"
                    style={{
                      background: active ? "var(--brand-primary)" : "var(--surf-2)",
                      color: active ? "#fffaf4" : "var(--tx)",
                      border: "1px solid var(--bd-2)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex-1">
                <span className="mb-1 block text-[11px] text-tx-dim">Compra (N)</span>
                <input
                  type="number"
                  min={2}
                  value={form.buyQuantity}
                  onChange={(e) =>
                    setForm({ ...form, buyQuantity: Math.max(2, Number(e.target.value) || 2) })
                  }
                  className="w-full rounded-[12px] px-3 py-2.5 text-[14px] text-tx outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
                />
              </div>
              <span className="mt-5 font-display text-lg font-extrabold text-tx-mut">x</span>
              <div className="flex-1">
                <span className="mb-1 block text-[11px] text-tx-dim">Paga (M)</span>
                <input
                  type="number"
                  min={1}
                  value={form.payQuantity}
                  onChange={(e) =>
                    setForm({ ...form, payQuantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full rounded-[12px] px-3 py-2.5 text-[14px] text-tx outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
                />
              </div>
            </div>

            {/* Categorías elegibles */}
            <label className="mb-1 block text-[12px] font-semibold text-tx-mut">
              Categorías elegibles (suman juntas para el bloque)
            </label>
            <div className="mb-4 flex flex-wrap gap-2">
              {categories.length === 0 ? (
                <span className="text-[12px] text-tx-mut">No hay categorías en el menú.</span>
              ) : (
                categories.map((c) => {
                  const active = form.categoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-transform active:scale-95"
                      style={{
                        background: active ? "var(--brand-primary)" : "var(--surf-2)",
                        color: active ? "#fffaf4" : "var(--tx)",
                        border: `1px solid ${active ? "transparent" : "var(--bd-2)"}`,
                      }}
                    >
                      {c.name}
                    </button>
                  );
                })
              )}
            </div>

            {/* Vigencia opcional */}
            <label className="mb-1 block text-[12px] font-semibold text-tx-mut">
              Vigencia (opcional)
            </label>
            <div className="mb-4 flex items-center gap-2">
              <input
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="flex-1 rounded-[12px] px-3 py-2.5 text-[13px] text-tx outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
              />
              <span className="text-tx-dim">→</span>
              <input
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="flex-1 rounded-[12px] px-3 py-2.5 text-[13px] text-tx outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
              />
            </div>

            {/* Activa */}
            <div className="mb-5 flex items-center justify-between rounded-[12px] px-3 py-3"
              style={{ background: "var(--surf-2)" }}>
              <span className="text-[13px] font-semibold text-tx">Promo activa</span>
              <Toggle
                checked={form.isActive}
                onChange={(next) => setForm({ ...form, isActive: next })}
                label="Promo activa"
              />
            </div>

            <div className="flex items-center gap-2">
              <PrimaryBtn ghost onClick={() => !saving && setForm(null)}>
                Cancelar
              </PrimaryBtn>
              <PrimaryBtn onClick={save} disabled={saving}>
                {saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear promo"}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2.5 text-[13px] font-semibold"
          style={{
            bottom: 96,
            color: toast.ok ? "var(--ok)" : "var(--err)",
            background: toast.ok ? "var(--ok-soft)" : "var(--err-soft)",
            border: `1px solid ${toast.ok ? "var(--ok)" : "var(--err)"}`,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </WtScreen>
  );
}
