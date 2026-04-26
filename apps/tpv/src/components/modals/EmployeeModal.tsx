"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";
import type { EmployeeDraft } from "@/contexts/ModalContext";

const EMPTY: EmployeeDraft = { name: "", role: "WAITER", pin: "", active: true };

const ROLES: { id: EmployeeDraft["role"]; label: string }[] = [
  { id: "ADMIN",   label: "Admin" },
  { id: "MANAGER", label: "Encargado" },
  { id: "CASHIER", label: "Cajero" },
  { id: "WAITER",  label: "Mesero" },
  { id: "DRIVER",  label: "Repartidor" },
];

export default function EmployeeModal({
  open,
  employee,
  onClose,
  onSave,
}: {
  open: boolean;
  employee: EmployeeDraft | "new" | null;
  onClose: () => void;
  onSave?: (draft: EmployeeDraft) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<EmployeeDraft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(employee && employee !== "new" ? { ...employee } : EMPTY);
  }, [open, employee]);

  const isNew = employee === "new" || (employee && !employee.id);

  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Nombre requerido");
    if (!draft.pin || draft.pin.length < 4) return toast.error("PIN de al menos 4 dígitos");
    setBusy(true);
    try {
      await onSave?.(draft);
      toast.success(isNew ? "Empleado creado" : "Empleado actualizado");
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
      title={isNew ? "Nuevo empleado" : "Editar empleado"}
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
            className={INPUT} style={INPUT_STYLE} placeholder="Juan Pérez" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rol">
            <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as EmployeeDraft["role"] })}
              className={INPUT} style={INPUT_STYLE}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="PIN (4-6 dígitos)">
            <input value={draft.pin ?? ""} onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              inputMode="numeric" className={INPUT} style={INPUT_STYLE} placeholder="••••" />
          </Field>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={!!draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="w-4 h-4 rounded" />
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>Empleado activo</span>
        </label>
      </div>
    </BaseModal>
  );
}

const INPUT = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}
