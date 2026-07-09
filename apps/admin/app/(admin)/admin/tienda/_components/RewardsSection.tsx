"use client";
import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import api from "@/lib/api";
import { Field, Input, Select, Button, IconButton, Skeleton, ErrorState, EmptyState, Pill, useToast, useConfirm } from "@/components/ds";
import type { Reward } from "./types";

export function RewardsSection() {
  const toast = useToast();
  const confirm = useConfirm();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form de alta
  const [name, setName] = useState("");
  const [pointsCost, setPointsCost] = useState(100);
  const [kind, setKind] = useState<"PRODUCT" | "DISCOUNT">("PRODUCT");
  const [menuItemId, setMenuItemId] = useState("");
  const [discountAmount, setDiscountAmount] = useState(50);

  const load = () => {
    setLoadError(false);
    Promise.all([api.get("/api/loyalty/rewards"), api.get("/api/menu/items?admin=true")])
      .then(([rw, mi]) => {
        setRewards(Array.isArray(rw.data) ? rw.data : []);
        const items = Array.isArray(mi.data) ? mi.data : (mi.data?.items || []);
        setMenuItems(items.map((i: any) => ({ id: i.id, name: i.name })));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim()) { toast.error("Ponle nombre a la recompensa"); return; }
    if (kind === "PRODUCT" && !menuItemId) { toast.error("Elige el producto que regala"); return; }
    setSaving(true);
    try {
      await api.post("/api/loyalty/rewards", {
        name: name.trim(),
        pointsCost,
        menuItemId: kind === "PRODUCT" ? menuItemId : undefined,
        discountAmount: kind === "DISCOUNT" ? discountAmount : undefined,
      });
      setName(""); setMenuItemId("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo crear la recompensa");
    } finally { setSaving(false); }
  };

  const toggle = async (r: Reward) => {
    try {
      await api.put(`/api/loyalty/rewards/${r.id}`, {
        name: r.name,
        description: r.description || undefined,
        pointsCost: r.pointsCost,
        menuItemId: r.menuItemId || undefined,
        discountAmount: r.menuItemId ? undefined : Number(r.discountAmount || 0),
        isActive: !r.isActive,
      });
      load();
    } catch (e: any) { toast.error(e?.response?.data?.error || "No se pudo actualizar"); }
  };

  const remove = async (r: Reward) => {
    if (!(await confirm({ title: `¿Eliminar la recompensa "${r.name}"?`, danger: true, confirmLabel: "Eliminar" }))) return;
    try { await api.delete(`/api/loyalty/rewards/${r.id}`); load(); }
    catch (e: any) { toast.error(e?.response?.data?.error || "No se pudo eliminar"); }
  };

  return (
    <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--bd-1)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Trophy size={14} className="shrink-0 text-tx-mid" />
        <p className="text-[13px] font-extrabold text-tx-hi">Recompensas canjeables</p>
      </div>

      {!loaded ? (
        <div className="mb-4 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : loadError ? (
        <div className="mb-4">
          <ErrorState title="No se pudieron cargar las recompensas" onRetry={load} />
        </div>
      ) : rewards.length > 0 ? (
        <div className="mb-4 space-y-2">
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-tx-hi">
                  <span className="truncate">{r.name}</span>
                  {!r.isActive && <Pill tone="neutral">Pausada</Pill>}
                </p>
                <p className="truncate text-[12px] text-tx-mut">
                  {r.menuItem ? `${r.menuItem.name} gratis` : `−$${Number(r.discountAmount || 0)} de descuento`} · {r.pointsCost} pts
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggle(r)}>
                  {r.isActive ? "Pausar" : "Activar"}
                </Button>
                <IconButton icon={X} label="Eliminar" size={32} danger onClick={() => remove(r)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <EmptyState icon={Trophy} title="Sin recompensas todavía" hint="Crea la primera: tus clientes las canjean con sus puntos en la tienda online." />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input type="text" value={name} placeholder="Ej. Hamburguesa de regalo" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cuesta (puntos)">
          <Input type="number" min="1" value={pointsCost} onChange={(e) => setPointsCost(Math.max(1, parseInt(e.target.value) || 1))} />
        </Field>
        <Field label="Qué otorga">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "PRODUCT" | "DISCOUNT")}>
            <option value="PRODUCT">Producto gratis</option>
            <option value="DISCOUNT">Descuento fijo ($)</option>
          </Select>
        </Field>
        {kind === "PRODUCT" ? (
          <Field label="Producto">
            <Select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
              <option value="">Elegir…</option>
              {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Descuento ($)">
            <Input type="number" min="1" step="any" value={discountAmount} onChange={(e) => setDiscountAmount(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        )}
      </div>
      <Button onClick={create} disabled={saving} loading={saving}>
        {saving ? "Creando…" : "Agregar recompensa"}
      </Button>
    </div>
  );
}
