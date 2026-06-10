"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Plus, X, FolderOpen, Pencil, Trash2, Lock, Search,
  ArrowUpRight, UtensilsCrossed,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, Pill, EmptyState,
  IconBadge, money,
} from "@/components/warmtech";

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
      alert(e.response?.data?.error || "Error al guardar");
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
      alert("Error al reasignar");
    }
  }

  async function removeFromCategory(item: MenuItem) {
    // No se puede quitar sin asignar a otra — mejor mover a otra categoría
    // (constraint impide dejar sin categoryId). Mostramos un selector.
    const otherCats = cats.filter((c) => c.id !== editCat?.id);
    if (otherCats.length === 0) {
      alert("No hay otras categorías disponibles. Crea otra categoría primero.");
      return;
    }
    const options = otherCats.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    const input = prompt(`¿A qué categoría mover "${item.name}"?\n\n${options}\n\nEscribe el número:`);
    if (!input) return;
    const idx = parseInt(input) - 1;
    const target = otherCats[idx];
    if (isNaN(idx) || !target) {
      alert("Opción inválida");
      return;
    }
    await assignItem(item, target.id);
  }

  async function toggleActive(cat: Category) {
    try {
      await api.put(`/api/menu/categories/${cat.id}`, { isActive: !cat.isActive });
      fetchData();
    } catch {
      alert("Error al actualizar");
    }
  }

  async function deleteCat(cat: Category) {
    const itemCount = allItems.filter((i) => i.categoryId === cat.id).length;
    if (itemCount > 0) {
      alert(`No puedes eliminar "${cat.name}" porque tiene ${itemCount} producto(s) asignado(s).\n\nPrimero mueve los productos a otra categoría desde "Ver productos".`);
      return;
    }
    if (!confirm(`¿Eliminar "${cat.name}"?`)) return;
    try {
      await api.delete(`/api/menu/categories/${cat.id}`);
      fetchData();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e.response?.data?.error || "Error al eliminar");
    }
  }

  const catItems = allItems.filter((i) => i.categoryId === editCat?.id);
  const otherItems = allItems.filter(
    (i) =>
      i.categoryId !== editCat?.id &&
      (search === "" || i.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Menú"
        title="Categorías"
        subtitle="Organiza tu menú por secciones"
        actions={
          <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>
            Nueva categoría
          </PrimaryBtn>
        }
      />

      {/* mobile action */}
      <div className="mb-4 md:hidden">
        <PrimaryBtn icon={Plus} onClick={() => openForm()}>
          Nueva categoría
        </PrimaryBtn>
      </div>

      {/* Modal nombre */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
        >
          <WtCard className="w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-tx-hi">
                {editCat ? "Editar categoría" : "Nueva categoría"}
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
            <form onSubmit={save} className="flex flex-col gap-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Hamburguesas, Tacos, Bebidas…"
                required
                autoFocus
                className="min-h-12 w-full rounded-xl px-4 text-sm outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
              <div className="flex gap-3">
                <PrimaryBtn ghost onClick={() => setShowForm(false)}>
                  Cancelar
                </PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}

      {/* Modal productos */}
      {showItems && editCat && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
        >
          <WtCard className="flex w-full max-w-2xl flex-col p-0" style={{ maxHeight: "90vh" }}>
            <div
              className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
              style={{ borderBottom: "1px solid var(--bd-1)" }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <IconBadge icon={FolderOpen} tone="ac" />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-extrabold text-tx-hi">{editCat.name}</h2>
                  <p className="text-[11px] text-tx-mut">{catItems.length} productos en esta categoría</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowItems(false)}
                aria-label="Cerrar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5 warmtech-scrollbar">
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
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        style={{ background: "var(--iris-soft)", border: "1px solid var(--bd-1)" }}
                      >
                        <ItemThumb item={item} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-tx">{item.name}</div>
                          <div className="text-xs text-primary">{money(item.price)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCategory(item)}
                          className="flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-bold"
                          style={{ background: "var(--err-soft)", color: "var(--err)" }}
                        >
                          Mover <ArrowUpRight size={13} />
                        </button>
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
                    className="min-h-11 w-full rounded-xl pl-9 pr-3 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {otherItems.slice(0, 20).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    >
                      <ItemThumb item={item} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-tx">{item.name}</div>
                        <div className="truncate text-xs text-tx-mut">
                          {cats.find((c) => c.id === item.categoryId)?.name || "Sin categoría"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => assignItem(item, editCat.id)}
                        className="flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-bold text-white"
                        style={{ background: "var(--brand-primary)" }}
                      >
                        <Plus size={13} /> Agregar
                      </button>
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
          </WtCard>
        </div>
      )}

      {/* Lista de categorías */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : cats.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Sin categorías"
          hint="Crea tu primera sección para organizar el menú."
          action={
            <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>
              Nueva categoría
            </PrimaryBtn>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cats.map((cat) => {
            const itemCount = allItems.filter((i) => i.categoryId === cat.id).length;
            return (
              <WtCard
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
                    className="min-h-9 rounded-xl px-3 text-xs font-bold text-primary"
                    style={{ background: "var(--iris-soft)" }}
                  >
                    Ver productos
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(cat)}
                    className="min-h-9 rounded-xl px-2"
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
                    className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCat(cat)}
                    title={itemCount > 0 ? `Mueve los ${itemCount} productos primero` : "Eliminar categoría"}
                    aria-label="Eliminar"
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{
                      background: itemCount > 0 ? "var(--surf-2)" : "var(--err-soft)",
                      color: itemCount > 0 ? "var(--tx-mut)" : "var(--err)",
                      cursor: itemCount > 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {itemCount > 0 ? <Lock size={14} /> : <Trash2 size={15} />}
                  </button>
                </div>
              </WtCard>
            );
          })}
        </div>
      )}
    </WtScreen>
  );
}

/* ── product thumbnail ───────────────────────────────────────────── */
function ItemThumb({ item }: { item: MenuItem }) {
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-tx-mut"
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
