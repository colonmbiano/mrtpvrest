"use client";
import { Modal, Field, Input, Button } from "@/components/ds";
import { type ConfigDraft, type Location, DAY_LABELS, ALL_DAYS } from "./types";

export function LocationConfigModal({
  loc,
  draft,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  loc: Location;
  draft: ConfigDraft;
  saving: boolean;
  onChange: (patch: Partial<ConfigDraft>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Configurar IA"
      subtitle={loc.name}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave} loading={saving} disabled={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Umbral ventas/semana" hint="Platillos que vendan menos de esto en la ventana entran en promo.">
        <Input
          type="number"
          min="1"
          value={draft.autoPromoThreshold}
          onChange={(e) => onChange({ autoPromoThreshold: parseInt(e.target.value) || 0 })}
        />
      </Field>

      <Field label="Descuento (%)" hint="Al guardar, se re-aplica de inmediato a las promos vigentes.">
        <Input
          type="number"
          min="1"
          max="100"
          value={draft.autoPromoDiscount}
          onChange={(e) => onChange({ autoPromoDiscount: parseInt(e.target.value) || 0 })}
        />
      </Field>

      <Field
        label="Tope máximo de platillos"
        hint="Máximo de platillos en promo a la vez. 0 = sin tope. Evita que se active todo el menú."
      >
        <Input
          type="number"
          min="0"
          value={draft.autoPromoMaxItems}
          onChange={(e) => onChange({ autoPromoMaxItems: parseInt(e.target.value) || 0 })}
        />
      </Field>

      <Field label="Días activos" hint="Selecciona los días en que las promociones deben estar activas.">
        <div className="grid grid-cols-2 gap-2">
          {ALL_DAYS.map((day) => (
            <label key={day} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.activeDays.includes(day)}
                onChange={(e) => {
                  const newDays = e.target.checked
                    ? [...draft.activeDays, day]
                    : draft.activeDays.filter((d) => d !== day);
                  onChange({ activeDays: newDays });
                }}
                className="h-4 w-4 rounded cursor-pointer"
              />
              <span className="text-sm">{DAY_LABELS[day]}</span>
            </label>
          ))}
        </div>
      </Field>
    </Modal>
  );
}
