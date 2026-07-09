"use client";
import { useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, Phone, Mail, MapPin, StickyNote,
  Factory, MessageCircle,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Button, IconButton, Modal, Field, Input,
  Toggle, Pill, EmptyState, LoadingCards, Avatar, Card, SettingRow,
  useToast, useConfirm,
} from "@/components/ds";

interface Supplier {
  id: string; name: string; contact?: string; phone?: string;
  email?: string; address?: string; notes?: string;
  isActive?: boolean; leadTimeDays?: number; minOrderAmount?: number;
  _count?: { ingredients: number; };
}
type TextField = "name" | "contact" | "phone" | "email" | "address" | "notes";
type FormState = {
  name: string; contact: string; phone: string; email: string; address: string; notes: string;
  isActive: boolean; leadTimeDays: string; minOrderAmount: string;
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
}

export default function ProveedoresPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Supplier | null>(null);
  const [saving, setSaving]       = useState(false);
  const emptyForm: FormState = { name:"", contact:"", phone:"", email:"", address:"", notes:"", isActive:true, leadTimeDays:"3", minOrderAmount:"0" };
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
    setForm(s ? {
      name:s.name, contact:s.contact||"", phone:s.phone||"", email:s.email||"", address:s.address||"", notes:s.notes||"",
      isActive: s.isActive ?? true,
      leadTimeDays: s.leadTimeDays != null ? String(s.leadTimeDays) : "3",
      minOrderAmount: s.minOrderAmount != null ? String(s.minOrderAmount) : "0",
    } : { ...emptyForm });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name, contact: form.contact, phone: form.phone, email: form.email,
        address: form.address, notes: form.notes, isActive: form.isActive,
        leadTimeDays: form.leadTimeDays === "" ? 0 : Number(form.leadTimeDays),
        minOrderAmount: form.minOrderAmount === "" ? 0 : Number(form.minOrderAmount),
      };
      if (editItem) await api.put("/api/inventory/suppliers/" + editItem.id, payload);
      else await api.post("/api/inventory/suppliers", payload);
      setShowForm(false);
      fetchSuppliers();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Error");
    }
    finally { setSaving(false); }
  }

  async function deleteSupplier(id: string) {
    if (!(await confirm({ title: "¿Eliminar proveedor?", danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete("/api/inventory/suppliers/" + id);
      fetchSuppliers();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "No se pudo eliminar el proveedor");
    }
  }

  const fields: { label: string; field: TextField; placeholder: string; required?: boolean; }[] = [
    { label:"Nombre de la empresa", field:"name", placeholder:"Distribuidora XYZ", required: true },
    { label:"Contacto", field:"contact", placeholder:"Juan García" },
    { label:"Teléfono", field:"phone", placeholder:"722 000 0000" },
    { label:"Email", field:"email", placeholder:"ventas@proveedor.com" },
    { label:"Dirección", field:"address", placeholder:"Calle, Ciudad" },
    { label:"Notas", field:"notes", placeholder:"Entrega los martes..." },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Inventario"
        title="Proveedores"
        subtitle={`${suppliers.length} proveedor${suppliers.length !== 1 ? "es" : ""} registrado${suppliers.length !== 1 ? "s" : ""}`}
        actions={<Button icon={Plus} onClick={() => openForm()}>Nuevo proveedor</Button>}
      />
      <PageTabs set="inventario" />

      {/* Acción en mobile (PageHeader es hidden en <md) */}
      <div className="mb-4 md:hidden">
        <Button full icon={Plus} onClick={() => openForm()}>Nuevo proveedor</Button>
      </div>

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={`${editItem ? "Editar" : "Nuevo"} proveedor`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button type="submit" loading={saving} onClick={() => save({ preventDefault() {} } as React.FormEvent)}>
              Guardar
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="flex flex-col">
          {fields.map(f => (
            <Field key={f.field} label={f.label} required={f.required}>
              <Input value={form[f.field]} onChange={e => setForm(p=>({...p,[f.field]:e.target.value}))}
                placeholder={f.placeholder} required={f.required} />
            </Field>
          ))}

          {/* Parámetros para sugerencias de orden de compra */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead time (días)">
              <Input type="number" min={0} inputMode="numeric"
                value={form.leadTimeDays} onChange={e => setForm(p=>({...p,leadTimeDays:e.target.value}))}
                placeholder="3" />
            </Field>
            <Field label="Compra mínima (MXN)">
              <Input type="number" min={0} step="0.01" inputMode="decimal"
                value={form.minOrderAmount} onChange={e => setForm(p=>({...p,minOrderAmount:e.target.value}))}
                placeholder="0" />
            </Field>
          </div>

          <SettingRow
            label="Proveedor activo"
            sub="Los inactivos se excluyen de las sugerencias de compra."
            right={<Toggle checked={form.isActive} onChange={(n) => setForm(p => ({ ...p, isActive: n }))} label="Proveedor activo" />}
            last
          />
        </form>
      </Modal>

      {/* List */}
      {loading ? (
        <LoadingCards count={6} />
      ) : suppliers.length === 0 ? (
        <EmptyState icon={Factory} title="Sin proveedores"
          hint="Registra tus proveedores para vincularlos a insumos y generar listas de compra."
          action={<Button icon={Plus} onClick={() => openForm()}>Nuevo proveedor</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map(s => {
            const phone = s.phone?.replace(/\D/g, "");
            return (
              <Card key={s.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <Avatar initials={initials(s.name)} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-base font-extrabold text-tx-hi">{s.name}</div>
                    {s.contact && <div className="truncate text-[12px] text-tx-mut">{s.contact}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {s.isActive === false && <Pill tone="neutral">Inactivo</Pill>}
                    <Pill tone="ac">{s._count?.ingredients || 0} ins.</Pill>
                  </div>
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
                  <div className="mt-2 flex items-start gap-2 rounded-ds-md p-2.5 text-[11.5px] text-tx-mut"
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
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                      style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}
                  <Button variant="secondary" size="sm" icon={Pencil} full onClick={() => openForm(s)}>Editar</Button>
                  <IconButton icon={Trash2} label="Eliminar" danger size={36} onClick={() => deleteSupplier(s.id)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
