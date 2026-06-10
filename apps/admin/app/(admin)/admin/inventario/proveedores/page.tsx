"use client";
import { useEffect, useState } from "react";
import {
  Plus, X, Pencil, Trash2, Phone, Mail, MapPin, StickyNote,
  Factory, ChevronLeft, MessageCircle,
} from "lucide-react";
import api from "@/lib/api";
import Link from "next/link";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, Pill, EmptyState, Avatar,
  LoadingCards,
} from "@/components/warmtech";

interface Supplier {
  id: string; name: string; contact?: string; phone?: string;
  email?: string; address?: string; notes?: string;
  _count?: { ingredients: number; };
}
type FormState = { name: string; contact: string; phone: string; email: string; address: string; notes: string; };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
}

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Supplier | null>(null);
  const [saving, setSaving]       = useState(false);
  const emptyForm: FormState = { name:"", contact:"", phone:"", email:"", address:"", notes:"" };
  const [form, setForm] = useState<FormState>(emptyForm);

  async function fetchSuppliers() {
    try {
      const { data } = await api.get("/api/inventory/suppliers");
      setSuppliers(data);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchSuppliers(); }, []);

  function openForm(s?: Supplier) {
    setEditItem(s || null);
    setForm(s ? { name:s.name, contact:s.contact||"", phone:s.phone||"", email:s.email||"", address:s.address||"", notes:s.notes||"" } : { ...emptyForm });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editItem) await api.put("/api/inventory/suppliers/" + editItem.id, form);
      else await api.post("/api/inventory/suppliers", form);
      setShowForm(false);
      fetchSuppliers();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || "Error");
    }
    finally { setSaving(false); }
  }

  async function deleteSupplier(id: string) {
    if (!confirm("¿Eliminar proveedor?")) return;
    await api.delete("/api/inventory/suppliers/" + id);
    fetchSuppliers();
  }

  const fields: { label: string; field: keyof FormState; placeholder: string; required?: boolean; }[] = [
    { label:"Nombre de la empresa", field:"name", placeholder:"Distribuidora XYZ", required: true },
    { label:"Contacto", field:"contact", placeholder:"Juan García" },
    { label:"Teléfono", field:"phone", placeholder:"722 000 0000" },
    { label:"Email", field:"email", placeholder:"ventas@proveedor.com" },
    { label:"Dirección", field:"address", placeholder:"Calle, Ciudad" },
    { label:"Notas", field:"notes", placeholder:"Entrega los martes..." },
  ];

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Inventario"
        title="Proveedores"
        subtitle={`${suppliers.length} proveedor${suppliers.length !== 1 ? "es" : ""} registrado${suppliers.length !== 1 ? "s" : ""}`}
        actions={
          <>
            <PrimaryBtn full={false} ghost icon={ChevronLeft} href="/admin/inventario">Inventario</PrimaryBtn>
            <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Proveedor</PrimaryBtn>
          </>
        }
      />

      {/* mobile back + add */}
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <Link href="/admin/inventario"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[13px] font-bold text-tx-mid"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
          <ChevronLeft size={16} /> Inventario
        </Link>
        <div className="flex-1" />
        <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Nuevo</PrimaryBtn>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.85)" }}>
          <WtCard className="my-4 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <h2 className="font-display text-xl font-extrabold text-tx-hi">{editItem ? "Editar" : "Nuevo"} proveedor</h2>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={save} className="flex flex-col gap-4 p-6">
              {fields.map(f => (
                <div key={f.field}>
                  <label className="mb-1.5 ml-1 block font-mono text-[9.5px] font-bold uppercase tracking-[.12em] text-tx-mut">{f.label}</label>
                  <input value={form[f.field]} onChange={e => setForm(p=>({...p,[f.field]:e.target.value}))}
                    placeholder={f.placeholder} required={f.required}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <PrimaryBtn ghost onClick={() => setShowForm(false)}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>{saving ? "…" : "Guardar"}</PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}

      {/* List */}
      {loading ? (
        <LoadingCards count={6} />
      ) : suppliers.length === 0 ? (
        <EmptyState icon={Factory} title="Sin proveedores"
          hint="Registra tus proveedores para vincularlos a insumos y generar listas de compra."
          action={<PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Nuevo proveedor</PrimaryBtn>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map(s => {
            const phone = s.phone?.replace(/\D/g, "");
            return (
              <WtCard key={s.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <Avatar initials={initials(s.name)} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-base font-extrabold text-tx-hi">{s.name}</div>
                    {s.contact && <div className="truncate text-[12px] text-tx-mut">{s.contact}</div>}
                  </div>
                  <Pill tone="ac">{s._count?.ingredients || 0} ins.</Pill>
                </div>

                <div className="mt-3 flex flex-col gap-1.5">
                  {s.phone && (
                    <div className="flex items-center gap-2 text-[12.5px] text-tx">
                      <Phone size={13} className="shrink-0 text-tx-mut" /> <span className="truncate">{s.phone}</span>
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2 text-[12.5px] text-tx">
                      <Mail size={13} className="shrink-0 text-tx-mut" /> <span className="truncate">{s.email}</span>
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-start gap-2 text-[12px] text-tx-mut">
                      <MapPin size={13} className="mt-0.5 shrink-0" /> <span>{s.address}</span>
                    </div>
                  )}
                </div>

                {s.notes && (
                  <div className="mt-2 flex items-start gap-2 rounded-xl p-2.5 text-[11.5px] text-tx-mut"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                    <StickyNote size={13} className="mt-0.5 shrink-0" /> <span>{s.notes}</span>
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  {phone && (
                    <a
                      href={`https://wa.me/${phone}`}
                      target="_blank" rel="noopener noreferrer"
                      aria-label="WhatsApp"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                      style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}
                  <button onClick={() => openForm(s)}
                    className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-tx-mid"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={() => deleteSupplier(s.id)}
                    aria-label="Eliminar"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                    <Trash2 size={15} />
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
