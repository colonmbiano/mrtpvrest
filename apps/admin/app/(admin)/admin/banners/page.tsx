"use client";
import { useEffect, useState, useRef } from "react";
import { Plus, ImageOff } from "lucide-react";
import api from "@/lib/api";
import { PageShell, PageHeader, SectionHead, Button, EmptyState, useToast, useConfirm } from "@/components/ds";
import { BannerCard } from "./_components/BannerCard";
import { BannerFormModal } from "./_components/BannerFormModal";
import { type Banner, type Cat, type Item, type BannerForm, emptyForm } from "./_components/types";

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBanner, setEditBanner] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<BannerForm>({ ...emptyForm });
  const toast = useToast();
  const confirm = useConfirm();

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

  useEffect(() => {
    fetchData();
  }, []);

  function openForm(banner?: Banner) {
    setEditBanner(banner || null);
    if (banner) {
      let days: number[] = [];
      try {
        days = JSON.parse(banner.scheduleDays || "[]");
      } catch {
        /* noop */
      }
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
      // mode=banner → Cloudinary guarda en 16:9 nativo (no cuadrado).
      const { data } = await api.post("/api/upload/image?mode=banner", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((p) => ({ ...p, imageUrl: data.url }));
    } catch {
      toast.error("Error al subir imagen");
    } finally {
      setUploading(false);
    }
  }

  function toggleDay(day: number) {
    setForm((p) => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter((d) => d !== day)
        : [...p.scheduleDays, day].sort(),
    }));
  }

  async function save() {
    if (!form.imageUrl) {
      toast.error("Agrega una imagen");
      return;
    }
    if (form.scheduleDays.length === 0 && !form.dateFrom) {
      toast.error("Selecciona al menos un día o un rango de fechas para programar el banner");
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
      toast.error(e2.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(banner: Banner) {
    await api.put(`/api/banners/${banner.id}`, { isActive: !banner.isActive });
    fetchData();
  }

  async function deleteBanner(id: string) {
    if (!(await confirm({ title: "¿Eliminar este banner?", danger: true, confirmLabel: "Eliminar" }))) return;
    await api.delete(`/api/banners/${id}`);
    fetchData();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Tienda en línea"
        title="Banners"
        subtitle="Se muestran automáticamente según su programación"
        actions={
          <Button icon={Plus} onClick={() => openForm()}>
            Nuevo banner
          </Button>
        }
      />

      {/* mobile new-banner CTA */}
      <div className="mb-4 md:hidden">
        <Button icon={Plus} full onClick={() => openForm()}>
          Nuevo banner
        </Button>
      </div>

      {showForm && (
        <BannerFormModal
          isEdit={!!editBanner}
          form={form}
          setForm={setForm}
          cats={cats}
          items={items}
          fileRef={fileRef}
          uploading={uploading}
          saving={saving}
          onUpload={uploadImage}
          onToggleDay={toggleDay}
          onSubmit={save}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Lista */}
      <SectionHead title={`Tus banners${banners.length > 0 ? ` (${banners.length})` : ""}`} />
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-ds-xl bg-surf-2" />
          ))}
        </div>
      ) : banners.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="No hay banners aún"
          hint="Crea tu primer banner para destacar promociones en tu tienda en línea."
          action={
            <Button icon={Plus} onClick={() => openForm()}>
              Nuevo banner
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {banners.map((banner) => (
            <BannerCard
              key={banner.id}
              banner={banner}
              onToggle={toggleActive}
              onEdit={openForm}
              onDelete={deleteBanner}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
