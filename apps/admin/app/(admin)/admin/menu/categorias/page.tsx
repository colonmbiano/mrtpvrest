"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Plus, FolderOpen, Pencil, Trash2, Lock, Search,
  ArrowUpRight, UtensilsCrossed,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Card, Modal, Button, Pill, EmptyState,
  IconBadge, Input, Select, useToast, useConfirm,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId?: string;
  imageUrl?: string;
}
interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export default function CategoriasPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [cats, setCats] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function fetchData() {
    const [c, i] = await Promise.all([
      api.get<Category[]>("/api/menu/categories"),
      // Traer TODOS los items incluyendo inactivos para el panel admin
      api
        .get<MenuItem[]>("/api/menu/items?admin=true")
        .catch(() => api.get<MenuItem[]>("/api/menu/items")),
    ]);
    setCats(c.data);
    setAllItems(i.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  function openForm(cat?: Category) {
    setEditCat(cat || null);
    setName(cat?.name || "");
    setShowForm(true);
  }

  function openItems(cat: Category) {
    setEditCat(cat);
    setSearch("");
    setShowItems(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editCat && !showItems) {
        await api.put(`/api/menu/categories/${editCat.id}`, { name });
      } else {
        await api.post("/api/menu/categories", { name });
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function assignItem(item: MenuItem, catId: string) {
    try {
      await api.put(`/api/menu/items/${item.id}`, { categoryId: catId });
      // Actualizar state local inmediatamente sin recargar
      setAllItems((p) =>
        p.map((i) => (i.id === item.id ? { ...i, categoryId: catId } : i)),
      );
    } catch {
      toast.error("Error al reasignar");
    }
  }

  async function toggleActive(cat: Category) {
    try {
      await api.put(`/api/menu/categories/${cat.id}`, { isActive: !cat.isActive });
      fetchData();
    } catch {
      toast.error("Error al actualizar");
    }
  }

  async function deleteCat(cat: Category) {
    const itemCount = allItems.filter((i) => i.categoryId === cat.id).length;
    if (itemCount > 0) {
      toast.error(`No puedes eliminar "${cat.name}" porque tiene ${itemCount} producto(s) asignado(s). Primero mueve los productos a otra categoría desde "Ver productos".`);
      return;
    }
    if (!(await confirm({ title: `¿Eliminar "${cat.name}"?`, danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/menu/categories/${cat.id}`);
      fetchData();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || "Error al eliminar");
    }
  }

  const catItems = allItems.filter((i) => i.categoryId === editCat?.id);
  const otherCats = cats.filter((c) => c.id !== editCat?.id);
  const otherItems = allItems.filter(
    (i) =>
      i.categoryId !== editCat?.id &&
      (search === "" || i.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Menú"
        title="Categorías"
        subtitle="Organiza tu menú por secciones"
        actions={
          <Button icon={Plus} onClick={() => openForm()}>Nueva categoría</Button>
        }
      />

      <PageTabs set="menu" />

      {/* mobile action */}
      <div className="mb-4 md:hidden">
        <Button full icon={Plus} onClick={() => openForm()}>Nueva categoría</Button>
      </div>

      {/* Modal nombre */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editCat ? "Editar categoría" : "Nueva categoría"} size="sm">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Hamburguesas, Tacos, Bebidas…"
            required
            autoFocus
          />
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button type="submit" full disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal productos */}
      <Modal open={showItems && !!editCat} onClose={() => setShowItems(false)} size="lg"
        title={editCat?.name}
        subtitle={editCat ? `${catItems.length} productos en esta categoría` : undefined}>
        <div className="flex flex-col gap-6">
          {/* Productos en esta categoría */}
          <div>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[.14em] text-primary">
              En esta categoría ({catItems.length})
            </h3>
            {catItems.length === 0 ? (
              <p className="text-sm text-tx-mut">Sin productos aún</p>
            ) : (
              <div className="flex flex-col gap-2">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-ds-md px-3 py-2.5"
                    style={{ background: "var(--accent-soft)", border: "1px solid var(--bd-1)" }}
                  >
                    <ItemThumb item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-tx">{item.name}</div>
                      <div className="text-xs text-primary">{formatMoney(item.price)}</div>
                    </div>
                    {otherCats.length === 0 ? (
                      <Pill tone="neutral">única categoría</Pill>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <ArrowUpRight size={14} className="text-tx-mut" />
                        <Select
                          aria-label={`Mover ${item.name} a otra categoría`}
                          value=""
                          onChange={(e) => { if (e.target.value) assignItem(item, e.target.value); }}
                          className="min-h-9 py-1.5 text-xs"
                        >
                          <option value="">Mover a…</option>
                          {otherCats.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agregar productos de otras categorías */}
          <div>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">
              Agregar desde otras categorías
            </h3>
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto…"
                className="min-h-11 w-full rounded-ds-md pl-9 pr-3 text-sm outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
            </div>
            <div className="flex flex-col gap-2">
              {otherItems.slice(0, 20).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-ds-md px-3 py-2.5"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                >
                  <ItemThumb item={item} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-tx">{item.name}</div>
                    <div className="truncate text-xs text-tx-mut">
                      {cats.find((c) => c.id === item.categoryId)?.name || "Sin categoría"}
                    </div>
                  </div>
                  <Button size="sm" icon={Plus} onClick={() => editCat && assignItem(item, editCat.id)}>Agregar</Button>
                </div>
              ))}
              {otherItems.length === 0 && (
                <p className="py-4 text-center text-sm text-tx-mut">
                  Todos los productos están en esta categoría
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Lista de categorías */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-ds-xl bg-surf-2" />
          ))}
        </div>
      ) : cats.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Sin categorías"
          hint="Crea tu primera sección para organizar el menú."
          action={
            <Button icon={Plus} onClick={() => openForm()}>Nueva categoría</Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cats.map((cat) => {
            const itemCount = allItems.filter((i) => i.categoryId === cat.id).length;
            return (
              <Card
                key={cat.id}
                className="flex flex-wrap items-center gap-3 p-4"
                style={{ opacity: cat.isActive ? 1 : 0.55 }}
              >
                <IconBadge icon={FolderOpen} tone="neutral" size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-sm font-extrabold text-tx-hi">{cat.name}</div>
                  <div className="mt-0.5 text-[11px] text-tx-mut">{itemCount} productos</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openItems(cat)}
                    className="min-h-9 rounded-ds-md px-3 text-xs font-bold text-primary"
                    style={{ background: "var(--accent-soft)" }}
                  >
                    Ver productos
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(cat)}
                    className="min-h-9 rounded-ds-md px-2"
                    aria-label={cat.isActive ? "Desactivar" : "Activar"}
                  >
                    <Pill tone={cat.isActive ? "ok" : "err"}>
                      {cat.isActive ? "Activa" : "Inactiva"}
                    </Pill>
                  </button>
                  <button
                    type="button"
                    onClick={() => openForm(cat)}
                    aria-label="Editar"
                    className="grid h-9 w-9 place-items-center rounded-ds-md text-tx-mut"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCat(cat)}
                    title={itemCount > 0 ? `Mueve los ${itemCount} productos primero` : "Eliminar categoría"}
                    aria-label="Eliminar"
                    className="grid h-9 w-9 place-items-center rounded-ds-md"
                    style={{
                      background: itemCount > 0 ? "var(--surf-2)" : "var(--err-soft)",
                      color: itemCount > 0 ? "var(--tx-mut)" : "var(--err)",
                      cursor: itemCount > 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {itemCount > 0 ? <Lock size={14} /> : <Trash2 size={15} />}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

/* ── product thumbnail ───────────────────────────────────────────── */
function ItemThumb({ item }: { item: MenuItem }) {
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-ds-md text-tx-mut"
      style={{ background: "var(--surf-3)" }}
    >
      {item.imageUrl ? (
        <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="h-full w-full object-cover" />
      ) : (
        <UtensilsCrossed size={16} strokeWidth={1.8} />
      )}
    </div>
  );
}
