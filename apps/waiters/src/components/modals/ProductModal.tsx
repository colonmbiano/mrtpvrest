"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import BaseModal from "@/components/ui/BaseModal";
import type { ProductDraft } from "@/contexts/ModalContext";

const EMPTY: ProductDraft = { name: "", price: 0, category: "", imageUrl: "", description: "" };

export default function ProductModal({
  open,
  product,
  onClose,
  onSave,
  categories = [],
}: {
  open: boolean;
  product: ProductDraft | "new" | null;
  onClose: () => void;
  onSave?: (draft: ProductDraft) => Promise<void> | void;
  categories?: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState<ProductDraft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(product && product !== "new" ? { ...product } : EMPTY);
  }, [open, product]);

  const isNew = product === "new" || (product && !product.id);

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    if (!(draft.price > 0)) {
      toast.error("Precio inválido");
      return;
    }
    setBusy(true);
    try {
      await onSave?.(draft);
      toast.success(isNew ? "Producto creado" : "Producto actualizado");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={isNew ? "Nuevo producto" : "Editar producto"}
      size="md"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="h-10 px-4 rounded-xl text-xs font-bold uppercase"
            style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={busy}
            className="h-10 px-5 rounded-xl text-xs font-bold uppercase hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={INPUT} placeholder="Hamburguesa especial" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio">
            <input type="number" step="0.01" value={draft.price || ""}
              onChange={(e) => setDraft({ ...draft, price: parseFloat(e.target.value) || 0 })}
              className={INPUT} placeholder="0.00" />
          </Field>
          <Field label="Categoría">
            <select value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className={INPUT}>
              <option value="">— Sin categoría —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="URL imagen">
          <div className="flex gap-2">
            <input value={draft.imageUrl ?? ""} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              className={INPUT} placeholder="https://..." />
            {draft.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover"
                style={{ border: "1px solid var(--border)" }} />
            )}
            {!draft.imageUrl && (
              <div className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                <ImagePlus size={16} />
              </div>
            )}
          </div>
        </Field>

        <Field label="Descripción">
          <textarea rows={3} value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className={INPUT} placeholder="Opcional..." />
        </Field>
      </div>
    </BaseModal>
  );
}

const INPUT =
  "w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="[&>*]:!bg-[var(--surface-2)] [&>*]:!text-[var(--text-primary)] [&>*]:!border [&>*]:!border-[var(--border)]">
        {children}
      </div>
    </label>
  );
}
