"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Save, Sparkles, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import {
  Card, Pill, Toggle, Button, IconButton, Field, Input, Select, Textarea,
  StatTile, LoadingState, EmptyState,
} from "@/components/ds";
import { useToast, useConfirm } from "@/components/ds";
import { formatMoney } from "@/lib/format";

// ── Tab: Sugerencias de venta (upsell) ────────────────────────────────────────
// Reglas de "¿le agregas X?" que el bot ofrece antes del checkout, con métricas
// de cuántas veces se ofreció, cuántas se aceptaron y cuánto dinero generó cada
// una. El producto y el precio siempre salen del menú vivo (el bot no inventa).
type UpsellRule = {
  id: string;
  name: string;
  enabled: boolean;
  menuItemId: string;
  variantId: string | null;
  productName: string;
  productMissing: boolean;
  triggerType: "ALWAYS" | "CATEGORY" | "ITEM";
  triggerId: string | null;
  triggerName: string | null;
  minSubtotal: number;
  offerText: string | null;
  offerCount: number;
  acceptCount: number;
  conversion: number;
  revenue: number;
};

type MenuPickerItem = { id: string; name: string; variants: { id: string; name: string }[] };
type MenuPickerCategory = { id: string; name: string };

type UpsellForm = {
  id: string | null;
  name: string;
  productKey: string; // "menuItemId::variantId" ("" en variantId si no hay)
  triggerType: "ALWAYS" | "CATEGORY" | "ITEM";
  triggerId: string;
  minSubtotal: number;
  offerText: string;
  enabled: boolean;
};

const emptyUpsellForm = (): UpsellForm => ({
  id: null,
  name: "",
  productKey: "",
  triggerType: "ALWAYS",
  triggerId: "",
  minSubtotal: 0,
  offerText: "",
  enabled: true,
});

const TRIGGER_LABELS: Record<UpsellRule["triggerType"], string> = {
  ALWAYS: "Siempre",
  CATEGORY: "Si el carrito trae la categoría",
  ITEM: "Si el carrito trae el producto",
};

export default function UpsellTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<UpsellRule[]>([]);
  const [totals, setTotals] = useState({ offers: 0, accepts: 0, revenue: 0 });
  const [items, setItems] = useState<MenuPickerItem[]>([]);
  const [categories, setCategories] = useState<MenuPickerCategory[]>([]);
  const [form, setForm] = useState<UpsellForm | null>(null);

  const load = useCallback(async () => {
    try {
      const [rulesRes, itemsRes, catsRes] = await Promise.all([
        api.get("/api/whatsapp/upsell"),
        api.get("/api/menu/items?admin=true"),
        api.get("/api/menu/categories"),
      ]);
      setRules(rulesRes.data.rules || []);
      setTotals(rulesRes.data.totals || { offers: 0, accepts: 0, revenue: 0 });
      const rawItems = Array.isArray(itemsRes.data) ? itemsRes.data : itemsRes.data?.items || [];
      setItems(
        rawItems.map((i: { id: string; name: string; variants?: { id: string; name: string }[] }) => ({
          id: i.id,
          name: i.name,
          variants: (i.variants || []).map((v) => ({ id: v.id, name: v.name })),
        }))
      );
      const rawCats = Array.isArray(catsRes.data) ? catsRes.data : catsRes.data?.categories || [];
      setCategories(rawCats.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    } catch {
      toast.error("No se pudieron cargar las sugerencias");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Opciones del selector de producto: una línea por variante (o el producto solo).
  const productOptions = items.flatMap((item) =>
    item.variants.length > 0
      ? item.variants.map((v) => ({ key: `${item.id}::${v.id}`, label: `${item.name} (${v.name})` }))
      : [{ key: `${item.id}::`, label: item.name }]
  );

  async function save() {
    if (!form || saving) return;
    const [menuItemId, variantId] = form.productKey.split("::");
    if (!form.name.trim()) return toast.error("Ponle un nombre a la sugerencia");
    if (!menuItemId) return toast.error("Elige el producto a sugerir");
    if (form.triggerType !== "ALWAYS" && !form.triggerId) {
      return toast.error("Elige qué dispara la sugerencia");
    }
    setSaving(true);
    try {
      await api.post("/api/whatsapp/upsell", {
        id: form.id || undefined,
        name: form.name,
        enabled: form.enabled,
        menuItemId,
        variantId: variantId || null,
        triggerType: form.triggerType,
        triggerId: form.triggerType === "ALWAYS" ? null : form.triggerId,
        minSubtotal: form.minSubtotal,
        offerText: form.offerText.trim() || null,
      });
      toast.success("Sugerencia guardada");
      setForm(null);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: UpsellRule) {
    try {
      await api.post("/api/whatsapp/upsell", {
        id: rule.id,
        name: rule.name,
        enabled: !rule.enabled,
        menuItemId: rule.menuItemId,
        variantId: rule.variantId,
        triggerType: rule.triggerType,
        triggerId: rule.triggerId,
        minSubtotal: rule.minSubtotal,
        offerText: rule.offerText,
      });
      await load();
    } catch {
      toast.error("No se pudo actualizar");
    }
  }

  async function removeRule(rule: UpsellRule) {
    if (!(await confirm({
      title: `¿Eliminar la sugerencia "${rule.name}"?`,
      body: "Sus métricas se pierden.",
      danger: true,
      confirmLabel: "Eliminar",
    }))) return;
    try {
      await api.delete(`/api/whatsapp/upsell/${rule.id}`);
      toast.success("Sugerencia eliminada");
      await load();
    } catch {
      toast.error("No se pudo eliminar");
    }
  }

  function editRule(rule: UpsellRule) {
    setForm({
      id: rule.id,
      name: rule.name,
      productKey: `${rule.menuItemId}::${rule.variantId || ""}`,
      triggerType: rule.triggerType,
      triggerId: rule.triggerId || "",
      minSubtotal: rule.minSubtotal,
      offerText: rule.offerText || "",
      enabled: rule.enabled,
    });
  }

  if (loading) return <LoadingState label="Cargando sugerencias" />;

  return (
    <div className="flex flex-col gap-4">
      {/* Métricas globales del upsell */}
      <div className="grid grid-cols-3 gap-2 md:max-w-xl">
        <StatTile label="Ofrecidas" value={totals.offers} />
        <StatTile
          label="Aceptadas"
          value={
            <span style={{ color: "var(--ok)" }}>
              {totals.accepts}
              {totals.offers > 0 && (
                <span className="ml-1 text-xs font-bold text-tx-mut">
                  ({Math.round((totals.accepts / totals.offers) * 100)}%)
                </span>
              )}
            </span>
          }
        />
        <StatTile
          label="Generado"
          value={<span style={{ color: "var(--brand-primary)" }}>{formatMoney(totals.revenue)}</span>}
        />
      </div>

      {!form && (
        <div>
          <Button onClick={() => setForm(emptyUpsellForm())} icon={Plus}>
            Nueva sugerencia
          </Button>
        </div>
      )}

      {/* Formulario crear/editar */}
      {form && (
        <Card className="flex flex-col gap-1 p-4">
          <div className="mb-2 font-display text-base font-extrabold text-tx-hi">
            {form.id ? "Editar sugerencia" : "Nueva sugerencia"}
          </div>

          <Field label="Nombre interno">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Papas con hamburguesa"
            />
          </Field>

          <Field label="Producto a sugerir">
            <Select
              value={form.productKey}
              onChange={(e) => setForm({ ...form, productKey: e.target.value })}
            >
              <option value="">— Elige un producto —</option>
              {productOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Cuándo ofrecerla">
            <Select
              value={form.triggerType}
              onChange={(e) => setForm({ ...form, triggerType: e.target.value as UpsellForm["triggerType"], triggerId: "" })}
            >
              <option value="ALWAYS">Siempre (cualquier pedido)</option>
              <option value="CATEGORY">Si el carrito trae una categoría</option>
              <option value="ITEM">Si el carrito trae un producto</option>
            </Select>
          </Field>

          {form.triggerType === "CATEGORY" && (
            <Field label="Categoría disparadora">
              <Select
                value={form.triggerId}
                onChange={(e) => setForm({ ...form, triggerId: e.target.value })}
              >
                <option value="">— Elige una categoría —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          )}

          {form.triggerType === "ITEM" && (
            <Field label="Producto disparador">
              <Select
                value={form.triggerId}
                onChange={(e) => setForm({ ...form, triggerId: e.target.value })}
              >
                <option value="">— Elige un producto —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Pedido mínimo (opcional, $)">
            <Input
              type="number"
              min={0}
              value={form.minSubtotal || ""}
              onChange={(e) => setForm({ ...form, minSubtotal: Math.max(0, Number(e.target.value) || 0) })}
              placeholder="0 = sin mínimo"
            />
          </Field>

          <Field
            label="Gancho del mensaje (opcional)"
            hint="El bot lo muestra seguido del producto y su precio real del menú. Si lo dejas vacío usa el texto estándar."
          >
            <Textarea
              value={form.offerText}
              onChange={(e) => setForm({ ...form, offerText: e.target.value })}
              rows={2}
              maxLength={300}
              placeholder="Ej. 🍟 ¿Unas papas para acompañar tu hamburguesa?"
            />
          </Field>

          <div className="mb-1 flex items-center gap-2">
            <Toggle checked={form.enabled} onChange={(next) => setForm({ ...form, enabled: next })} label="Sugerencia activa" />
            <span className="text-sm text-tx-mid">Sugerencia activa</span>
          </div>

          <div className="mt-2 flex gap-3">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} loading={saving} icon={Save}>
              {saving ? "Guardando…" : "Guardar sugerencia"}
            </Button>
          </div>
        </Card>
      )}

      {/* Lista de reglas con métricas */}
      {rules.length === 0 && !form ? (
        <EmptyState
          icon={Sparkles}
          title="Sin sugerencias todavía"
          hint="Crea tu primera sugerencia de venta: el asistente la ofrecerá justo antes de cerrar el pedido y aquí verás cuánto genera."
        />
      ) : (
        rules.map((rule) => (
          <Card key={rule.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[14px] font-extrabold text-tx-hi">{rule.name}</span>
                  {rule.enabled ? <Pill tone="ok">Activa</Pill> : <Pill tone="neutral">Pausada</Pill>}
                  {rule.productMissing && <Pill tone="err">Producto eliminado</Pill>}
                </div>
                <div className="mt-1 text-xs text-tx-mut">
                  Sugiere <span className="font-bold text-tx">{rule.productName}</span> · {TRIGGER_LABELS[rule.triggerType]}
                  {rule.triggerName ? ` "${rule.triggerName}"` : ""}
                  {rule.minSubtotal > 0 ? ` · mínimo ${formatMoney(rule.minSubtotal)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <IconButton icon={Pencil} label="Editar" onClick={() => editRule(rule)} />
                <IconButton icon={Trash2} label="Eliminar" danger onClick={() => removeRule(rule)} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="rounded-xl px-2.5 py-2" style={{ background: "var(--surf-2)" }}>
                <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Ofrecidas</div>
                <div className="font-display text-sm font-extrabold text-tx-hi">{rule.offerCount}</div>
              </div>
              <div className="rounded-xl px-2.5 py-2" style={{ background: "var(--surf-2)" }}>
                <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Aceptadas</div>
                <div className="font-display text-sm font-extrabold text-tx-hi">{rule.acceptCount}</div>
              </div>
              <div className="rounded-xl px-2.5 py-2" style={{ background: "var(--surf-2)" }}>
                <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Conversión</div>
                <div className="font-display text-sm font-extrabold" style={{ color: "var(--ok)" }}>{rule.conversion}%</div>
              </div>
              <div className="rounded-xl px-2.5 py-2" style={{ background: "var(--surf-2)" }}>
                <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Generado</div>
                <div className="font-display text-sm font-extrabold" style={{ color: "var(--brand-primary)" }}>{formatMoney(rule.revenue)}</div>
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => toggleRule(rule)}
                className="text-xs font-bold text-primary"
              >
                {rule.enabled ? "Pausar sugerencia" : "Reactivar sugerencia"}
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
