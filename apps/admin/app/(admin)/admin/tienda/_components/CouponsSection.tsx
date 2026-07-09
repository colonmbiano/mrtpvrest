"use client";
import { useEffect, useState } from "react";
import { Ticket, X } from "lucide-react";
import api from "@/lib/api";
import { Field, Input, Select, Button, IconButton, Skeleton, ErrorState, EmptyState, Pill, useToast, useConfirm } from "@/components/ds";
import type { Coupon } from "./types";

export function CouponsSection() {
  const toast = useToast();
  const confirm = useConfirm();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form de alta
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(10);
  const [minOrderAmount, setMinOrderAmount] = useState(150);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = () => {
    setLoadError(false);
    api.get("/api/loyalty/coupons")
      .then((r) => setCoupons(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);

  const create = async () => {
    if (!code.trim()) { toast.error("Ponle un código al cupón"); return; }
    setSaving(true);
    try {
      await api.post("/api/loyalty/coupons", {
        code: code.trim(),
        discountType,
        discountValue,
        minOrderAmount,
        maxUses: maxUses.trim() === "" ? null : Number(maxUses),
        expiresAt: expiresAt || null,
      });
      setCode(""); setMaxUses(""); setExpiresAt("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo crear el cupón");
    } finally { setSaving(false); }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.put(`/api/loyalty/coupons/${c.id}`, { isActive: !c.isActive });
      load();
    } catch (e: any) { toast.error(e?.response?.data?.error || "No se pudo actualizar"); }
  };

  const remove = async (c: Coupon) => {
    if (!(await confirm({ title: `¿Eliminar el cupón "${c.code}"?`, danger: true, confirmLabel: "Eliminar" }))) return;
    try { await api.delete(`/api/loyalty/coupons/${c.id}`); load(); }
    catch (e: any) { toast.error(e?.response?.data?.error || "No se pudo eliminar"); }
  };

  const summarize = (c: Coupon) => {
    const val = c.discountType === "PERCENTAGE" ? `${Number(c.discountValue)}%` : `$${Number(c.discountValue)}`;
    const min = Number(c.minOrderAmount) > 0 ? ` · mín $${Number(c.minOrderAmount)}` : "";
    const uses = c.maxUses ? ` · ${c.usedCount}/${c.maxUses} usos` : ` · ${c.usedCount} usos`;
    const exp = c.expiresAt ? ` · vence ${new Date(c.expiresAt).toLocaleDateString()}` : "";
    return `${val} de descuento${min}${uses}${exp}`;
  };

  return (
    <div className="mt-2">
      {!loaded ? (
        <div className="mb-4 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : loadError ? (
        <div className="mb-4">
          <ErrorState title="No se pudieron cargar los cupones" onRetry={load} />
        </div>
      ) : coupons.length > 0 ? (
        <div className="mb-4 space-y-2">
          {coupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-tx-hi">
                  <span className="truncate font-mono">{c.code}</span>
                  {!c.isActive && <Pill tone="neutral">Pausado</Pill>}
                </p>
                <p className="truncate text-[12px] text-tx-mut">{summarize(c)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggle(c)}>
                  {c.isActive ? "Pausar" : "Activar"}
                </Button>
                <IconButton icon={X} label="Eliminar" size={32} danger onClick={() => remove(c)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <EmptyState
            icon={Ticket}
            title="Sin cupones todavía"
            hint="Crea uno exclusivo de la tienda (ej. TIENDA10) y anima a tus clientes a pedir por la web."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Código">
          <Input type="text" value={code} placeholder="Ej. TIENDA10" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Tipo de descuento">
          <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENTAGE" | "FIXED")}>
            <option value="PERCENTAGE">Porcentaje (%)</option>
            <option value="FIXED">Monto fijo ($)</option>
          </Select>
        </Field>
        <Field label={discountType === "PERCENTAGE" ? "Descuento (%)" : "Descuento ($)"}>
          <Input type="number" min="1" step="any" value={discountValue} onChange={(e) => setDiscountValue(Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        <Field label="Compra mínima ($)">
          <Input type="number" min="0" step="any" value={minOrderAmount} onChange={(e) => setMinOrderAmount(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="Usos máx. (vacío = ilimitado)">
          <Input type="number" min="1" value={maxUses} placeholder="Ilimitado" onChange={(e) => setMaxUses(e.target.value)} />
        </Field>
        <Field label="Vence (opcional)">
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </div>
      <Button onClick={create} disabled={saving} loading={saving}>
        {saving ? "Creando…" : "Agregar cupón"}
      </Button>
    </div>
  );
}
