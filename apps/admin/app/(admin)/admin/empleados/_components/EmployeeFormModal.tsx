"use client";
import { RotateCcw } from "lucide-react";
import { Modal, Button, Field, Input, Toggle } from "@/components/ds";
import { ROLES, ROLE_DEFAULTS, DAYS, PERMS } from "./shared";

/* Alta / edición de empleado. Usa el Modal del ds (overlay fixed inset-0).
   Los campos "Nombre completo" y "PIN" usan Field → el <input> es HERMANO del
   <label> (contrato del e2e 04-empleados.spec.ts). Los botones de acción van
   DENTRO del <form> para que "Guardar" (type=submit) dispare el submit. */
export function EmployeeFormModal({
  open,
  editEmp,
  form, setForm,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editEmp: any;
  form: any; setForm: React.Dispatch<React.SetStateAction<any>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  function toggleDay(day: string) {
    setForm((p: any) => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter((d: string) => d !== day)
        : [...p.scheduleDays, day],
    }));
  }

  return (
    <Modal open={open} onClose={onClose} title={`${editEmp ? "Editar" : "Nuevo"} empleado`} size="lg">
      <form onSubmit={onSubmit}>
        <div className="mb-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nombre completo" required>
              <Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} required />
            </Field>
          </div>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))} />
          </Field>
          <Field label={editEmp ? "PIN nuevo (vacío = no cambia)" : "PIN (4-6 dígitos)"} required={!editEmp}>
            <Input
              value={form.pin}
              onChange={(e) => setForm((p: any) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
              inputMode="numeric"
              pattern="\d*"
              {...(!editEmp && { required: true })}
              maxLength={6}
              placeholder={editEmp ? "Sin cambios" : "1234"}
              className="font-mono tracking-widest"
            />
          </Field>
        </div>

        <div className="mb-4">
          <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Rol</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ROLES.map((r) => {
              const RoleIcon = r.icon;
              const active = form.role === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { const defs = ROLE_DEFAULTS[r.value] || ROLE_DEFAULTS.WAITER; setForm((p: any) => ({ ...p, role: r.value, ...defs })); }}
                  className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-ds-md px-2 text-[11px] font-bold transition-colors"
                  style={{
                    background: active ? "var(--brand-primary)" : "var(--surf-2)",
                    color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
                    border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
                  }}
                >
                  <RoleIcon size={16} /> {r.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Horario</label>
          <div className="mb-2 flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-tx-mut">Entrada</label>
              <Input type="time" value={form.scheduleStart} onChange={(e) => setForm((p: any) => ({ ...p, scheduleStart: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-tx-mut">Salida</label>
              <Input type="time" value={form.scheduleEnd} onChange={(e) => setForm((p: any) => ({ ...p, scheduleEnd: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-1.5">
            {DAYS.map((d) => {
              const active = form.scheduleDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className="min-h-10 flex-1 rounded-ds-md text-[11px] font-bold transition-colors"
                  style={{
                    background: active ? "var(--brand-primary)" : "var(--surf-2)",
                    color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
                    border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {form.role === "WAITER" && (
          <div className="mb-4">
            <Field label="Mesas asignadas (separadas por coma)">
              <Input
                value={form.tables.join(",")}
                onChange={(e) => setForm((p: any) => ({ ...p, tables: e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean) }))}
                placeholder="1,2,3,4"
              />
            </Field>
          </div>
        )}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Permisos individuales</label>
            <button
              type="button"
              onClick={() => setForm((p: any) => ({ ...p, ...ROLE_DEFAULTS[form.role] }))}
              className="inline-flex items-center gap-1 rounded-ds-sm px-2 py-1 text-[11px] font-bold text-primary"
              style={{ background: "var(--surf-2)" }}
            >
              <RotateCcw size={12} /> Restaurar por rol
            </button>
          </div>
          <div className="overflow-hidden rounded-ds-md" style={{ border: "1px solid var(--bd-1)" }}>
            {PERMS.map((p, i) => (
              <div
                key={p.key}
                className="flex items-center justify-between px-4 py-2.5"
                style={i < PERMS.length - 1 ? { borderBottom: "1px solid var(--bd-1)" } : undefined}
              >
                <span className="flex items-center gap-2 text-[13.5px] text-tx">
                  <p.icon size={15} className="text-tx-mut" /> {p.label}
                </span>
                <Toggle checked={!!form[p.key]} onChange={(next) => setForm((prev: any) => ({ ...prev, [p.key]: next }))} label={p.label} />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between rounded-ds-md px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <span className="text-sm font-medium text-tx">Empleado activo</span>
          <Toggle checked={!!form.isActive} onChange={(next) => setForm((p: any) => ({ ...p, isActive: next }))} label="Empleado activo" />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" full onClick={onClose}>Cancelar</Button>
          <Button type="submit" full loading={saving}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
