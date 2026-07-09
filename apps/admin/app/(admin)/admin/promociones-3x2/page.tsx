"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Plus } from "lucide-react";
import api from "@/lib/api";
import { PageShell, PageHeader, Button, EmptyState, LoadingCards, useToast, useConfirm } from "@/components/ds";
import { BulkPromoCard } from "./_components/BulkPromoCard";
import { BulkPromoDrawer } from "./_components/BulkPromoDrawer";
import { type BulkPromo, type Category, type FormState, EMPTY_FORM, toDateInput } from "./_components/types";

export default function BulkPromosPage() {
  const [promos, setPromos] = useState<BulkPromo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null); // null = drawer cerrado
  const toast = useToast();
  const confirm = useConfirm();

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
      toast.error(err?.response?.data?.error || "Error al cargar promociones");
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      startTime: promo.startTime || "",
      endTime: promo.endTime || "",
      categoryIds: promo.categories.map((c) => c.id),
    });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return toast.error("Ponle un nombre a la promo");
    if (form.payQuantity >= form.buyQuantity)
      return toast.error("Debes pagar menos de lo que se compra (ej. 3x2)");
    if (form.categoryIds.length === 0) return toast.error("Elige al menos una categoría elegible");

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      buyQuantity: form.buyQuantity,
      payQuantity: form.payQuantity,
      isActive: form.isActive,
      categoryIds: form.categoryIds,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
    };
    try {
      if (form.id) {
        await api.put(`/api/bulk-promos/${form.id}`, payload);
        toast.success("Promo actualizada");
      } else {
        await api.post("/api/bulk-promos", payload);
        toast.success("Promo creada");
      }
      setForm(null);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (promo: BulkPromo) => {
    if (!(await confirm({ title: `¿Eliminar la promo "${promo.name}"?`, danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/bulk-promos/${promo.id}`);
      toast.success("Promo eliminada");
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al eliminar");
    }
  };

  // Activar/desactivar inline (optimista con recarga).
  const toggleActive = async (promo: BulkPromo) => {
    try {
      await api.put(`/api/bulk-promos/${promo.id}`, { isActive: !promo.isActive });
      setPromos((ps) => ps.map((p) => (p.id === promo.id ? { ...p, isActive: !p.isActive } : p)));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al cambiar estado");
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Promociones"
        title="Promos por cantidad (NxM)"
        subtitle="Compra N, paga M sobre categorías elegibles (ej. 3x2 en alitas y boneless). El descuento se aplica solo en el TPV; siempre se regala la pieza más barata."
        actions={
          <Button icon={Plus} onClick={openCreate}>
            Nueva promo
          </Button>
        }
      />

      {/* CTA en móvil (PageHeader es desktop-only) */}
      <div className="mb-4 md:hidden">
        <Button icon={Plus} full onClick={openCreate}>
          Nueva promo
        </Button>
      </div>

      {loading ? (
        <LoadingCards count={3} />
      ) : promos.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin promociones NxM"
          hint="Crea un 3x2 en alitas y boneless: por cada 3 piezas, la más barata sale gratis."
          action={
            <Button icon={Plus} onClick={openCreate}>
              Crear la primera
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {promos.map((promo) => (
            <BulkPromoCard key={promo.id} promo={promo} onToggle={toggleActive} onEdit={openEdit} onRemove={remove} />
          ))}
        </div>
      )}

      {form && (
        <BulkPromoDrawer
          form={form}
          setForm={setForm}
          categories={categories}
          saving={saving}
          onSave={save}
          onClose={() => setForm(null)}
        />
      )}
    </PageShell>
  );
}
