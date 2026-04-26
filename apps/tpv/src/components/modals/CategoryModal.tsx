"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";
import type { CategoryDraft } from "@/contexts/ModalContext";

const EMPTY: CategoryDraft = { name: "", color: "#10b981", icon: "" };
const COLORS = ["#10b981", "#7c3aed", "#ff5c35", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

export default function CategoryModal({
  open,
  category,
  onClose,
  onSave,
}: {
  open: boolean;
  category: CategoryDraft | "new" | null;
  onClose: () => void;
  onSave?: (draft: CategoryDraft) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(category && category !== "new" ? { ...category } : EMPTY);
  }, [open, category]);

  const isNew = category === "new" || (category && !category.id);

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    setBusy(true);
    try {
      await onSave?.(draft);
      toast.success(isNew ? "Categoría creada" : "Categoría actualizada");
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
      title={isNew ? "Nueva categoría" : "Editar categoría"}
      size="sm"
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
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Nombre</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Bebidas"
            className="px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const active = draft.color === c;
              return (
                <button key={c} onClick={() => setDraft({ ...draft, color: c })}
                  className="w-8 h-8 rounded-full transition-all"
                  style={{
                    background: c,
                    border: active ? "2px solid var(--text-primary)" : "2px solid transparent",
                    outline: active ? `3px solid ${c}33` : "none",
                  }} />
              );
            })}
          </div>
        </label>
      </div>
    </BaseModal>
  );
}
