"use client";
import { useEffect, useState } from "react";
import {
  Store, MapPin, Phone, Plus, Pencil, Trash2,
  Bike, ShoppingBag, Utensils, Sparkles, Receipt,
} from "lucide-react";
import api from "@/lib/api";
import {
  Card, SectionHead, Button, IconButton, Pill, IconBadge, EmptyState,
  Modal, Field, Input, Toggle, Skeleton, useConfirm, useToast, type Tone,
} from "@/components/ds";

type Location = { id: string; name: string; slug: string; address?: string; phone?: string; autoPromoEnabled?: boolean; autoPromoThreshold?: number; autoPromoDiscount?: number; hasDelivery?: boolean; hasTakeaway?: boolean; hasTableMap?: boolean; hasOpenTabs?: boolean; };

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const ORDER_TYPES: { key: "hasDelivery" | "hasTakeaway" | "hasTableMap"; label: string; icon: typeof Bike; tone: Tone }[] = [
  { key: "hasDelivery", label: "Delivery", icon: Bike, tone: "ac" },
  { key: "hasTakeaway", label: "Para llevar", icon: ShoppingBag, tone: "info" },
  { key: "hasTableMap", label: "En mesa", icon: Utensils, tone: "ok" },
];

const ORDER_TYPE_OPTIONS: { key: "hasDelivery" | "hasTakeaway" | "hasTableMap" | "hasOpenTabs"; label: string; icon: typeof Bike }[] = [
  { key: "hasDelivery", label: "Delivery (envío a domicilio)", icon: Bike },
  { key: "hasTakeaway", label: "Para llevar (takeaway)", icon: ShoppingBag },
  { key: "hasTableMap", label: "En mesa (dine-in / mapa de mesas)", icon: Utensils },
  { key: "hasOpenTabs", label: "Cuentas abiertas (bar / tab)", icon: Receipt },
];

const EMPTY_FORM = { name: "", address: "", phone: "", autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 15, hasDelivery: true, hasTakeaway: true, hasTableMap: true, hasOpenTabs: false };

export default function LocationsSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();
  const toast = useToast();

  const fetchLocations = () => {
    setLoading(true);
    api.get("/api/admin/locations")
      .then(r => setLocations(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLocations(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(""); setShowModal(true); };
  const openEdit = (loc: Location) => { setEditing(loc); setForm({ name: loc.name, address: loc.address || "", phone: loc.phone || "", autoPromoEnabled: loc.autoPromoEnabled || false, autoPromoThreshold: loc.autoPromoThreshold || 10, autoPromoDiscount: loc.autoPromoDiscount || 15, hasDelivery: loc.hasDelivery ?? true, hasTakeaway: loc.hasTakeaway ?? true, hasTableMap: loc.hasTableMap ?? true, hasOpenTabs: loc.hasOpenTabs ?? false }); setError(""); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es requerido"); return; }
    setSaving(true); setError("");
    try {
      if (editing) {
        await api.put(`/api/admin/locations/${editing.id}`, form);
      } else {
        await api.post("/api/admin/locations", { ...form, slug: slugify(form.name) });
      }
      setShowModal(false);
      fetchLocations();
      if (!editing) window.location.reload();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `¿Eliminar sucursal "${name}"?`,
      body: "Esta acción no se puede deshacer.",
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/locations/${id}`);
      fetchLocations();
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Error al eliminar");
    }
  };

  return (
    <section className="mt-2">
      <SectionHead title="Mis sucursales" action="Nueva" onAction={openCreate} />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-ds-lg" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin sucursales registradas"
          hint="Crea tu primera sucursal para comenzar a operar."
          action={<Button icon={Plus} onClick={openCreate}>Nueva sucursal</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {locations.map(loc => (
            <Card key={loc.id} className="p-4 md:p-5">
              <div className="flex items-start gap-3">
                <IconBadge icon={Store} tone="ac" size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-extrabold text-tx-hi">{loc.name}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-tx-dim">/{loc.slug}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <IconButton icon={Pencil} label="Editar sucursal" onClick={() => openEdit(loc)} />
                  <IconButton icon={Trash2} label="Eliminar sucursal" danger onClick={() => handleDelete(loc.id, loc.name)} />
                </div>
              </div>

              {(loc.address || loc.phone) && (
                <div className="mt-3 space-y-1 text-[12px] text-tx-mut">
                  {loc.address && <p className="flex items-center gap-1.5"><MapPin size={13} className="shrink-0 text-tx-dim" /> {loc.address}</p>}
                  {loc.phone && <p className="flex items-center gap-1.5"><Phone size={13} className="shrink-0 text-tx-dim" /> {loc.phone}</p>}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {ORDER_TYPES.map(t => {
                  const on = loc[t.key] ?? true;
                  return on ? (
                    <Pill key={t.key} tone={t.tone}>
                      <t.icon size={11} strokeWidth={2} /> {t.label}
                    </Pill>
                  ) : (
                    <span
                      key={t.key}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[10.5px] font-semibold text-tx-dim line-through"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    >
                      <t.icon size={11} strokeWidth={2} /> {t.label}
                    </span>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Editar sucursal" : "Nueva sucursal"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-1">
          <Field label="Nombre" required>
            <Input autoFocus type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Sucursal Centro" />
          </Field>
          <Field label="Dirección">
            <Input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Ej. Av. Reforma 123" />
          </Field>
          <Field label="Teléfono">
            <Input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Ej. 55 1234 5678" />
          </Field>

          <div className="flex items-start gap-3 rounded-ds-lg p-4" style={{ background: "var(--accent-soft)" }}>
            <Sparkles size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-[11.5px] leading-relaxed text-tx-mut">
              Las <strong className="text-primary">Promociones con IA</strong> (activación, umbral y % de descuento) ahora se configuran en la sección <strong className="text-primary">Promociones IA</strong>.
            </p>
          </div>

          <div className="rounded-ds-lg p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Tipos de pedido en esta sucursal</p>
            <div className="space-y-2.5">
              {ORDER_TYPE_OPTIONS.map(opt => (
                <div key={opt.key} className="flex min-h-11 items-center gap-3">
                  <opt.icon size={15} className="shrink-0 text-tx-mid" />
                  <span className="flex-1 text-[12.5px] font-semibold text-tx">{opt.label}</span>
                  <Toggle
                    checked={form[opt.key]}
                    onChange={next => setForm({ ...form, [opt.key]: next })}
                    label={opt.label}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="pt-1 text-xs font-bold text-err">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)} full>Cancelar</Button>
            <Button type="submit" disabled={saving} loading={saving} full>
              {editing ? "Actualizar" : "Crear sucursal"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
