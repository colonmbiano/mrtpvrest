"use client";
import { CheckCircle2, Clock, History, Pencil, Trash2, Users } from "lucide-react";
import { Card, Pill, Avatar } from "@/components/ds";
import { PERMS, roleMeta, initials } from "./shared";

/* Tarjeta de empleado. IMPORTANTE (e2e): el botón de eliminar debe ser el
   ÚLTIMO <button> de la tarjeta — no reordenar la fila de acciones. */
export function EmployeeCard({
  emp, selected, onToggleSelect, onDetail, onEdit, onDelete,
}: {
  emp: any;
  selected: boolean;
  onToggleSelect: () => void;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const role = roleMeta(emp.role);
  const RoleIcon = role?.icon ?? Users;
  const isOnShift = emp.shifts?.length > 0;

  return (
    <Card
      className="relative overflow-hidden"
      style={{
        borderColor: selected ? "var(--brand-primary)" : isOnShift ? "var(--ok)" : undefined,
        opacity: emp.isActive ? 1 : 0.55,
      }}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        aria-label={selected ? "Deseleccionar" : "Seleccionar"}
        className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-md"
        style={{
          background: selected ? "var(--brand-primary)" : "var(--surf-2)",
          border: `1px solid ${selected ? "transparent" : "var(--bd-1)"}`,
          color: "var(--accent-contrast)",
        }}
      >
        {selected && <CheckCircle2 size={14} />}
      </button>

      <div className="flex items-center gap-3 p-4">
        {emp.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.photo} alt="" className="h-12 w-12 rounded-ds-md object-cover" />
        ) : (
          <Avatar initials={initials(emp.name)} size={48} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-extrabold text-tx-hi">{emp.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-tx-mut">
            <RoleIcon size={12} style={{ color: `var(--${role?.tone === "ac" ? "brand-primary" : role?.tone})` }} />
            {role?.label}
          </div>
          {emp.phone && <div className="truncate text-[11px] text-tx-dim">{emp.phone}</div>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4">
        {isOnShift && <Pill tone="ok" live>En turno</Pill>}
        {!emp.isActive && <Pill tone="err">Inactivo</Pill>}
      </div>

      {PERMS.some((p) => emp[p.key]) && (
        <div className="flex flex-wrap gap-1 px-4 pt-2">
          {PERMS.filter((p) => emp[p.key]).map((p) => (
            <span
              key={p.key}
              className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--brand-primary)" }}
            >
              <p.icon size={10} /> {p.label}
            </span>
          ))}
        </div>
      )}

      {(emp.scheduleStart || emp.scheduleDays?.length > 0) && (
        <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] text-tx-mut">
          <Clock size={12} /> {emp.scheduleStart || "?"} - {emp.scheduleEnd || "?"}
          {emp.scheduleDays?.length > 0 && ` · ${emp.scheduleDays.join(", ")}`}
        </div>
      )}

      <div className="flex gap-2 p-4 pt-3">
        <button
          type="button"
          onClick={onDetail}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-ds-md text-xs font-bold text-tx-mut"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <History size={14} /> Historial
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-ds-md text-tx-mut"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <Pencil size={15} />
        </button>
        {/* Eliminar — DEBE ser el último <button> de la tarjeta (contrato e2e). */}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-ds-md"
          style={{ background: "var(--err-soft)", color: "var(--err)" }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </Card>
  );
}
