"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

interface Supplier {
  id: string; name: string; contact?: string; phone?: string;
  email?: string; address?: string; notes?: string;
  _count?: { ingredients: number; };
}
type FormState = { name: string; contact: string; phone: string; email: string; address: string; notes: string; };

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Supplier | null>(null);
  const [saving, setSaving]       = useState(false);
  const emptyForm: FormState = { name:"", contact:"", phone:"", email:"", address:"", notes:"" };
  const [form, setForm] = useState<FormState>(emptyForm);

  async function fetchSuppliers() {
    const { data } = await api.get("/api/inventory/suppliers");
    setSuppliers(data);
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
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/inventario" className="text-sm font-bold" style={{color:"var(--muted)"}}>← Inventario</Link>
          <h1 className="font-syne text-3xl font-black">Proveedores</h1>
        </div>
        <button onClick={() => openForm()}
          className="px-4 py-2 rounded-xl text-sm font-syne font-black"
          style={{background:"var(--gold)",color:"#000"}}>
          + Proveedor
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-md rounded-2xl border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
              <h2 className="font-syne font-black text-xl">{editItem ? "Editar" : "Nuevo"} proveedor</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
            </div>
            <form onSubmit={save} className="p-6 flex flex-col gap-4">
              {fields.map(f => (
                <div key={f.field}>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>{f.label}</label>
                  <input value={form[f.field]} onChange={e => setForm(p=>({...p,[f.field]:e.target.value}))}
                    placeholder={f.placeholder} required={f.required}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
              ))}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl font-bold border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-syne font-black"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
        {suppliers.map(s => (
          <div key={s.id} className="rounded-2xl border p-5" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-syne font-bold text-lg">{s.name}</div>
                {s.contact && <div className="text-sm" style={{color:"var(--muted)"}}>{s.contact}</div>}
              </div>
              <span className="text-xs px-2 py-1 rounded-full font-bold"
                style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)"}}>
                {s._count?.ingredients || 0} ing.
              </span>
            </div>
            {s.phone && <div className="text-sm mb-1">📞 {s.phone}</div>}
            {s.email && <div className="text-sm mb-1">✉️ {s.email}</div>}
            {s.address && <div className="text-sm mb-1" style={{color:"var(--muted)"}}>📍 {s.address}</div>}
            {s.notes && <div className="text-xs mt-2 p-2 rounded-xl" style={{background:"var(--surf2)",color:"var(--muted)"}}>{s.notes}</div>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => openForm(s)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Editar</button>
              <button onClick={() => deleteSupplier(s.id)}
                className="px-3 py-2 rounded-xl text-xs font-bold"
                style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>🗑️</button>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="col-span-3 text-center py-20 rounded-2xl border"
            style={{background:"var(--surf)",borderColor:"var(--border)",color:"var(--muted)"}}>
            Sin proveedores registrados
          </div>
        )}
      </div>
    </div>
  );
}