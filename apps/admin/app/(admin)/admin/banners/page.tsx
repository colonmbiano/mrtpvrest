"use client";
import { useEffect, useState, useRef } from "react";
import {
  Plus, X, Image as ImageIcon, Upload, CalendarDays, Clock,
  Pencil, Trash2, ImageOff, Link2,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionHead, Pill, Toggle, PrimaryBtn,
  EmptyState,
} from "@/components/warmtech";

const DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
];

const LINK_TYPES = [
  { value: "NONE",     label: "Sin enlace" },
  { value: "CATEGORY", label: "Ir a categoría" },
  { value: "ITEM",     label: "Ir a producto" },
  { value: "URL",      label: "URL externa" },
];

const emptyForm = {
  title: "", description: "", imageUrl: "",
  linkType: "NONE", linkValue: "", isActive: false,
  scheduleDays: [] as number[],
  scheduleStart: "", scheduleEnd: "",
  dateFrom: "", dateTo: "",
};

type Banner = {
  id: string;
  title?: string;
  description?: string;
  imageUrl: string;
  linkType?: string;
  linkValue?: string;
  isActive: boolean;
  scheduleDays?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  dateFrom?: string;
  dateTo?: string;
};
type Cat = { id: string; name: string };
type Item = { id: string; name: string };

const inputCls = "w-full min-h-11 rounded-xl px-4 text-sm outline-none";
const inputStyle = {
  background: "var(--surf-2)",
  border: "1px solid var(--bd-1)",
  color: "var(--tx)",
} as const;

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [cats, setCats]       = useState<Cat[]>([]);
  const [items, setItems]     = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBanner, setEditBanner] = useState<Banner | null>(null);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm });

  async function fetchData() {
    setLoading(true);
    try {
      const [b, c, i] = await Promise.all([
        api.get("/api/banners/all"),
        api.get("/api/menu/categories"),
        api.get("/api/menu/items"),
      ]);
      setBanners(b.data);
      setCats(c.data);
      setItems(i.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  function openForm(banner?: Banner) {
    setEditBanner(banner || null);
    if (banner) {
      let days: number[] = [];
      try { days = JSON.parse(banner.scheduleDays || "[]"); } catch { /* noop */ }
      setForm({
        title: banner.title || "",
        description: banner.description || "",
        imageUrl: banner.imageUrl || "",
        linkType: banner.linkType || "NONE",
        linkValue: banner.linkValue || "",
        isActive: banner.isActive,
        scheduleDays: days,
        scheduleStart: banner.scheduleStart || "",
        scheduleEnd: banner.scheduleEnd || "",
        dateFrom: banner.dateFrom ? banner.dateFrom.slice(0, 10) : "",
        dateTo: banner.dateTo ? banner.dateTo.slice(0, 10) : "",
      });
    } else {
      setForm({ ...emptyForm, scheduleDays: [] });
    }
    setShowForm(true);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post("/api/upload/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((p) => ({ ...p, imageUrl: data.url }));
    } catch { alert("Error al subir imagen"); }
    finally { setUploading(false); }
  }

  function toggleDay(day: number) {
    setForm((p) => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter((d) => d !== day)
        : [...p.scheduleDays, day].sort(),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.imageUrl) { alert("Agrega una imagen"); return; }
    if (form.scheduleDays.length === 0 && !form.dateFrom) {
      alert("Selecciona al menos un día o un rango de fechas para programar el banner");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        scheduleDays: JSON.stringify(form.scheduleDays),
        dateFrom: form.dateFrom ? new Date(form.dateFrom + "T00:00:00").toISOString() : null,
        dateTo: form.dateTo ? new Date(form.dateTo + "T23:59:59").toISOString() : null,
      };
      if (editBanner) {
        await api.put(`/api/banners/${editBanner.id}`, payload);
      } else {
        await api.post("/api/banners", payload);
      }
      setShowForm(false);
      fetchData();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      alert(e2.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  }

  async function toggleActive(banner: Banner) {
    await api.put(`/api/banners/${banner.id}`, { isActive: !banner.isActive });
    fetchData();
  }

  async function deleteBanner(id: string) {
    if (!confirm("¿Eliminar este banner?")) return;
    await api.delete(`/api/banners/${id}`);
    fetchData();
  }

  function scheduleLabel(banner: Banner) {
    const parts: string[] = [];
    try {
      const days: number[] = JSON.parse(banner.scheduleDays || "[]");
      if (days.length > 0) parts.push(days.map((d) => DAYS[d]?.label ?? "").filter(Boolean).join(", "));
    } catch { /* noop */ }
    if (banner.scheduleStart && banner.scheduleEnd)
      parts.push(`${banner.scheduleStart} - ${banner.scheduleEnd}`);
    if (banner.dateFrom || banner.dateTo) {
      const from = banner.dateFrom ? new Date(banner.dateFrom).toLocaleDateString("es-MX") : "...";
      const to   = banner.dateTo   ? new Date(banner.dateTo).toLocaleDateString("es-MX")   : "...";
      parts.push(`${from} → ${to}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Sin programación";
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Tienda en línea"
        title="Banners"
        subtitle="Se muestran automáticamente según su programación"
        actions={
          <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>
            Nuevo banner
          </PrimaryBtn>
        }
      />

      {/* mobile new-banner CTA */}
      <div className="mb-4 md:hidden">
        <PrimaryBtn icon={Plus} onClick={() => openForm()}>Nuevo banner</PrimaryBtn>
      </div>

      {/* Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
          style={{ background: "rgba(0,0,0,.85)" }}
        >
          <WtCard className="my-4 w-full max-w-lg overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-6 py-4"
              style={{ borderColor: "var(--bd-1)" }}
            >
              <h2 className="font-display text-xl font-extrabold text-tx-hi">
                {editBanner ? "Editar banner" : "Nuevo banner"}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={save} className="flex flex-col gap-5 p-6">
              {/* Imagen / preview */}
              <div>
                <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                  Imagen
                </label>
                {form.imageUrl ? (
                  <div className="relative mb-2 overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="preview" className="h-36 w-full object-cover" />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end p-3"
                      style={{ background: "linear-gradient(0deg,rgba(0,0,0,.7),transparent)" }}
                    >
                      <div className="min-w-0">
                        {form.title && <div className="truncate font-display text-sm font-extrabold text-white">{form.title}</div>}
                        {form.description && <div className="truncate text-[11px] text-white/80">{form.description}</div>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="mb-2 grid h-36 w-full place-items-center rounded-xl text-tx-dim"
                    style={{ background: "var(--surf-2)", border: "1px dashed var(--bd-1)" }}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <ImageIcon size={26} />
                      <span className="text-[11px]">Vista previa del banner</span>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-tx-mid"
                  style={{ border: "1px solid var(--bd-1)" }}
                >
                  <Upload size={16} /> {uploading ? "Subiendo…" : "Subir imagen"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadImage} />
                <input
                  value={form.imageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="o pega URL de imagen"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Titulo y descripcion */}
              {[
                { label: "Título", field: "title", placeholder: "Ej: Jueves de Burritos $100" },
                { label: "Descripción", field: "description", placeholder: "Ej: Solo en burritos campechanos" },
              ].map((f) => (
                <div key={f.field}>
                  <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                    {f.label}
                  </label>
                  <input
                    value={(form as Record<string, unknown>)[f.field] as string}
                    onChange={(e) => setForm((p) => ({ ...p, [f.field]: e.target.value }))}
                    placeholder={f.placeholder}
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              ))}

              {/* Enlace */}
              <div>
                <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                  Enlace al tocar
                </label>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {LINK_TYPES.map((t) => {
                    const active = form.linkType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, linkType: t.value, linkValue: "" }))}
                        className="min-h-10 rounded-xl text-xs font-bold"
                        style={{
                          background: active ? "var(--iris-soft)" : "var(--surf-2)",
                          color: active ? "var(--brand-primary)" : "var(--tx-mut)",
                          border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {form.linkType === "CATEGORY" && (
                  <select
                    value={form.linkValue}
                    onChange={(e) => setForm((p) => ({ ...p, linkValue: e.target.value }))}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">Selecciona categoría</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {form.linkType === "ITEM" && (
                  <select
                    value={form.linkValue}
                    onChange={(e) => setForm((p) => ({ ...p, linkValue: e.target.value }))}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">Selecciona producto</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                )}
                {form.linkType === "URL" && (
                  <input
                    value={form.linkValue}
                    onChange={(e) => setForm((p) => ({ ...p, linkValue: e.target.value }))}
                    placeholder="https://..."
                    className={inputCls}
                    style={inputStyle}
                  />
                )}
              </div>

              {/* ── PROGRAMACION ───────────────────────────────── */}
              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
                <div className="mb-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-primary">
                  <CalendarDays size={13} /> Programación
                </div>

                {/* Dias de la semana */}
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-bold text-tx-mut">Días de la semana</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const on = form.scheduleDays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleDay(d.value)}
                          className="min-h-10 rounded-xl px-3 text-xs font-bold transition-all"
                          style={{
                            background: on ? "var(--brand-primary)" : "var(--surf-1)",
                            color: on ? "#fffaf4" : "var(--tx-mut)",
                            border: `1px solid ${on ? "var(--brand-primary)" : "var(--bd-1)"}`,
                          }}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setForm((p) => ({ ...p, scheduleDays: [0, 1, 2, 3, 4, 5, 6] }))}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-primary">
                      Todos los días
                    </button>
                    <button type="button" onClick={() => setForm((p) => ({ ...p, scheduleDays: [1, 2, 3, 4, 5] }))}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-tx-mut">
                      Lun-Vie
                    </button>
                    <button type="button" onClick={() => setForm((p) => ({ ...p, scheduleDays: [5, 6] }))}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-tx-mut">
                      Fin de semana
                    </button>
                  </div>
                </div>

                {/* Horario */}
                <div className="mb-4">
                  <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-tx-mut">
                    <Clock size={13} /> Horario (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={form.scheduleStart}
                      onChange={(e) => setForm((p) => ({ ...p, scheduleStart: e.target.value }))}
                      className="min-h-11 flex-1 rounded-xl px-3 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                    />
                    <span className="text-tx-mut">—</span>
                    <input
                      type="time"
                      value={form.scheduleEnd}
                      onChange={(e) => setForm((p) => ({ ...p, scheduleEnd: e.target.value }))}
                      className="min-h-11 flex-1 rounded-xl px-3 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                    />
                  </div>
                </div>

                {/* Rango de fechas */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-tx-mut">Rango de fechas (opcional)</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="mb-1 text-xs text-tx-mut">Desde</div>
                      <input
                        type="date"
                        value={form.dateFrom}
                        onChange={(e) => setForm((p) => ({ ...p, dateFrom: e.target.value }))}
                        className="min-h-11 w-full rounded-xl px-3 text-sm outline-none"
                        style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                      />
                    </div>
                    <span className="mt-4 text-tx-mut">→</span>
                    <div className="flex-1">
                      <div className="mb-1 text-xs text-tx-mut">Hasta (expiración)</div>
                      <input
                        type="date"
                        value={form.dateTo}
                        onChange={(e) => setForm((p) => ({ ...p, dateTo: e.target.value }))}
                        className="min-h-11 w-full rounded-xl px-3 text-sm outline-none"
                        style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Activo */}
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-tx">Banner activo</div>
                  <div className="mt-0.5 text-[11px] text-tx-mut">Se mostrará solo en los días/horas programados</div>
                </div>
                <Toggle
                  checked={form.isActive}
                  onChange={(next) => setForm((p) => ({ ...p, isActive: next }))}
                  label="Banner activo"
                />
              </div>

              <div className="flex gap-3">
                <PrimaryBtn ghost onClick={() => setShowForm(false)}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar banner"}
                </PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}

      {/* Lista */}
      <SectionHead title={`Tus banners${banners.length > 0 ? ` (${banners.length})` : ""}`} />
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : banners.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="No hay banners aún"
          hint="Crea tu primer banner para destacar promociones en tu tienda en línea."
          action={<PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Nuevo banner</PrimaryBtn>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {banners.map((banner) => (
            <WtCard
              key={banner.id}
              className="overflow-hidden"
              style={banner.isActive ? undefined : { opacity: 0.6 }}
            >
              <div className="flex flex-col sm:flex-row">
                {/* preview */}
                <div className="relative h-36 w-full shrink-0 sm:h-auto sm:w-48" style={{ background: "var(--surf-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={banner.imageUrl} alt={banner.title || "banner"} className="h-full w-full object-cover" />
                  <div className="absolute left-2 top-2">
                    <Pill tone={banner.isActive ? "ok" : "neutral"} live={banner.isActive}>
                      {banner.isActive ? "Activo" : "Borrador"}
                    </Pill>
                  </div>
                </div>

                {/* info */}
                <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="font-display text-sm font-extrabold text-tx-hi">
                      {banner.title || "Sin título"}
                    </div>
                    {banner.description && (
                      <div className="mt-0.5 text-xs text-tx-mut">{banner.description}</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-primary"
                        style={{ background: "var(--iris-soft)" }}
                      >
                        <CalendarDays size={12} /> {scheduleLabel(banner)}
                      </span>
                      {banner.linkType && banner.linkType !== "NONE" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-tx-mut">
                          <Link2 size={12} />
                          {LINK_TYPES.find((t) => t.value === banner.linkType)?.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-1.5"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    >
                      <span className="text-[11px] font-semibold text-tx-mut">
                        {banner.isActive ? "Activo" : "Borrador"}
                      </span>
                      <Toggle
                        checked={banner.isActive}
                        onChange={() => toggleActive(banner)}
                        label={banner.isActive ? "Desactivar banner" : "Activar banner"}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => openForm(banner)}
                      aria-label="Editar"
                      className="grid h-11 w-11 place-items-center rounded-xl text-tx-mid"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBanner(banner.id)}
                      aria-label="Eliminar"
                      className="grid h-11 w-11 place-items-center rounded-xl"
                      style={{ background: "var(--err-soft)", color: "var(--err)" }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </WtCard>
          ))}
        </div>
      )}
    </WtScreen>
  );
}
