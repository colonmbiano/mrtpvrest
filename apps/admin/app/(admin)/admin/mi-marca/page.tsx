"use client";
import { useEffect, useState } from "react";
import {
  Store, Camera, ImageIcon, MapPin, Phone, Plus, Pencil, Trash2,
  Bike, ShoppingBag, Utensils, Sparkles, X,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionHead, SettingRow, PrimaryBtn,
  Pill, IconBadge, EmptyState, type Tone,
} from "@/components/warmtech";

type Location = { id: string; name: string; slug: string; address?: string; phone?: string; autoPromoEnabled?: boolean; autoPromoThreshold?: number; autoPromoDiscount?: number; hasDelivery?: boolean; hasTakeaway?: boolean; hasTableMap?: boolean; };

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/* ── reusable styled input ───────────────────────────────────────── */
function WtInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="min-h-12 w-full rounded-xl px-4 text-sm font-medium outline-none transition-colors focus:border-[var(--brand-primary)]"
      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
      {children}
    </div>
  );
}

function LocationsSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 15, hasDelivery: true, hasTakeaway: true, hasTableMap: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchLocations = () => {
    setLoading(true);
    api.get("/api/admin/locations")
      .then(r => setLocations(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLocations(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: "", address: "", phone: "", autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 15, hasDelivery: true, hasTakeaway: true, hasTableMap: true }); setError(""); setShowModal(true); };
  const openEdit = (loc: Location) => { setEditing(loc); setForm({ name: loc.name, address: loc.address || "", phone: loc.phone || "", autoPromoEnabled: loc.autoPromoEnabled || false, autoPromoThreshold: loc.autoPromoThreshold || 10, autoPromoDiscount: loc.autoPromoDiscount || 15, hasDelivery: loc.hasDelivery ?? true, hasTakeaway: loc.hasTakeaway ?? true, hasTableMap: loc.hasTableMap ?? true }); setError(""); setShowModal(true); };

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
    if (!confirm(`¿Eliminar sucursal "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/admin/locations/${id}`);
      fetchLocations();
      window.location.reload();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Error al eliminar");
    }
  };

  const orderTypes: { key: "hasDelivery" | "hasTakeaway" | "hasTableMap"; label: string; icon: typeof Bike; tone: Tone }[] = [
    { key: "hasDelivery", label: "Delivery", icon: Bike, tone: "ac" },
    { key: "hasTakeaway", label: "Para llevar", icon: ShoppingBag, tone: "info" },
    { key: "hasTableMap", label: "En mesa", icon: Utensils, tone: "ok" },
  ];

  return (
    <section className="mt-2">
      <SectionHead
        title="Mis sucursales"
        action="Nueva"
        onAction={openCreate}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin sucursales registradas"
          hint="Crea tu primera sucursal para comenzar a operar."
          action={<PrimaryBtn icon={Plus} full={false} onClick={openCreate}>Nueva sucursal</PrimaryBtn>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {locations.map(loc => (
            <WtCard key={loc.id} className="p-4 md:p-5">
              <div className="flex items-start gap-3">
                <IconBadge icon={Store} tone="ac" size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-extrabold text-tx-hi">{loc.name}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-tx-dim">/{loc.slug}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button" onClick={() => openEdit(loc)} aria-label="Editar sucursal"
                    className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut transition-colors hover:text-primary"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button" onClick={() => handleDelete(loc.id, loc.name)} aria-label="Eliminar sucursal"
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{ background: "var(--err-soft)", color: "var(--err)" }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {(loc.address || loc.phone) && (
                <div className="mt-3 space-y-1 text-[12px] text-tx-mut">
                  {loc.address && <p className="flex items-center gap-1.5"><MapPin size={13} className="shrink-0 text-tx-dim" /> {loc.address}</p>}
                  {loc.phone && <p className="flex items-center gap-1.5"><Phone size={13} className="shrink-0 text-tx-dim" /> {loc.phone}</p>}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {orderTypes.map(t => {
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
            </WtCard>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div
            className="warmtech-card max-h-[92vh] w-full max-w-md overflow-y-auto warmtech-scrollbar rounded-b-none rounded-t-[26px] p-6 md:rounded-[26px]"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="font-display text-xl font-extrabold text-tx-hi">
                {editing ? "Editar sucursal" : "Nueva sucursal"}
              </h3>
              <button
                type="button" onClick={() => setShowModal(false)} aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <FieldLabel>Nombre *</FieldLabel>
                <WtInput autoFocus type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Sucursal Centro" />
              </div>
              <div>
                <FieldLabel>Dirección</FieldLabel>
                <WtInput type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Ej. Av. Reforma 123" />
              </div>
              <div>
                <FieldLabel>Teléfono</FieldLabel>
                <WtInput type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Ej. 55 1234 5678" />
              </div>

              <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "var(--iris-soft)" }}>
                <Sparkles size={18} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-[11.5px] leading-relaxed text-tx-mut">
                  Las <strong className="text-primary">Promociones con IA</strong> (activación, umbral y % de descuento) ahora se configuran en la sección <strong className="text-primary">Promociones IA</strong>.
                </p>
              </div>

              <div className="rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Tipos de pedido en esta sucursal</p>
                <div className="space-y-2.5">
                  {[
                    { key: "hasDelivery" as const, label: "Delivery (envío a domicilio)", icon: Bike },
                    { key: "hasTakeaway" as const, label: "Para llevar (takeaway)", icon: ShoppingBag },
                    { key: "hasTableMap" as const, label: "En mesa (dine-in / mapa de mesas)", icon: Utensils },
                  ].map(opt => (
                    <label key={opt.key} className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form[opt.key]}
                        onChange={e => setForm({ ...form, [opt.key]: e.target.checked })}
                        className="h-5 w-5 rounded"
                        style={{ accentColor: "var(--brand-primary)" }}
                      />
                      <opt.icon size={15} className="shrink-0 text-tx-mid" />
                      <span className="text-[12.5px] font-semibold text-tx">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs font-bold text-err">{error}</p>}
              <div className="flex gap-3 pt-1">
                <PrimaryBtn ghost type="button" onClick={() => setShowModal(false)}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>
                  {saving ? "Guardando…" : editing ? "Actualizar" : "Crear sucursal"}
                </PrimaryBtn>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default function BrandConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState({
    name: "",
    logoUrl: "",
  });

  useEffect(() => {
    api.get("/api/admin/config")
      .then(res => {
        setConfig(prev => ({ ...prev, name: res.data?.name ?? "", logoUrl: res.data?.logoUrl ?? "" }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string; // "data:image/png;base64,..."
      setConfig(prev => ({ ...prev, logoUrl: base64 }));
      setUploading(false);
    };
    reader.onerror = () => {
      alert("Error al leer la imagen");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  async function handleSave() {
    setSaving(true);
    try {
      await api.put("/api/admin/brand", { name: config.name, logoUrl: config.logoUrl });
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error desconocido";
      alert(`Error al guardar (${status ?? "sin respuesta"}): ${msg}`);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <WtScreen>
        <PageHeader eyebrow="Identidad" title="Mi Marca" subtitle="Personaliza tu identidad visual" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-64 animate-pulse rounded-[18px] bg-surf-2 md:col-span-1" />
          <div className="h-40 animate-pulse rounded-[18px] bg-surf-2 md:col-span-2" />
        </div>
      </WtScreen>
    );
  }

  return (
    <WtScreen>
      <PageHeader eyebrow="Identidad" title="Mi Marca" subtitle="Personaliza tu identidad visual" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Logo */}
        <WtCard className="flex flex-col items-center p-6 md:col-span-1 md:p-7">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Logo oficial</p>
          <div className="relative mb-5">
            <div
              className="grid h-32 w-32 place-items-center overflow-hidden rounded-3xl"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}
            >
              {config.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.logoUrl} className="h-full w-full object-contain" alt="Logo del restaurante" />
              ) : (
                <ImageIcon size={40} className="text-tx-dim" />
              )}
              {uploading && (
                <div className="absolute inset-0 grid animate-pulse place-items-center bg-black/80 font-mono text-[10px] font-bold uppercase text-primary">
                  Subiendo…
                </div>
              )}
            </div>
            <label
              className="absolute -bottom-2 -right-2 grid h-11 w-11 cursor-pointer place-items-center rounded-2xl text-white transition-transform hover:scale-110"
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)", border: "3px solid var(--surf-1)" }}
            >
              <Camera size={18} />
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-tx-mut">
            Toca la cámara para subir un logo PNG o JPG.
          </p>
        </WtCard>

        {/* Datos del negocio */}
        <div className="space-y-4 md:col-span-2">
          <WtCard className="p-5 md:p-6">
            <SectionHead title="Datos del negocio" />
            <div>
              <FieldLabel>Nombre del restaurante</FieldLabel>
              <input
                type="text"
                value={config.name}
                onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, name: v })); }}
                className="min-h-12 w-full rounded-xl px-4 font-display text-lg font-extrabold outline-none transition-colors focus:border-[var(--brand-primary)]"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx-hi)" }}
              />
            </div>
          </WtCard>

          <PrimaryBtn icon={Store} onClick={handleSave} disabled={saving || uploading}>
            {saving ? "Guardando…" : "Actualizar identidad"}
          </PrimaryBtn>
        </div>
      </div>

      <div className="mt-8">
        <LocationsSection />
      </div>
    </WtScreen>
  );
}
