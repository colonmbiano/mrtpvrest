"use client";
import { Modal, Field, Input, Button } from "@/components/ds";
import { type ConfigDraft, type Location } from "./types";

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
    </Modal>
  );
}
