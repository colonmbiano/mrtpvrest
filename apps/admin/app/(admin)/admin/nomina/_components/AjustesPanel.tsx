"use client";
import { useState } from "react";
import { AlertCircle, Percent, Save } from "lucide-react";
import { Card, SectionLabel, Segmented, Input, Toggle, Button, ErrorState } from "@/components/ds";
import { PAY_TYPES } from "./shared";

export function AjustesPanel({ config, cfgErr, onSave, onRetry }: { config: any; cfgErr: boolean; onSave: (p: any) => void; onRetry: () => void }) {
  const [days, setDays] = useState<string>(String(config.periodLengthDays ?? 7));
  const [defaultPayType, setDefaultPayType] = useState<string>(config.defaultPayType || "DAILY");
  const [fiscal, setFiscal] = useState<boolean>(Boolean(config.fiscalEnabled));
  const [empDiscount, setEmpDiscount] = useState<string>(String(config.employeeDiscountPct ?? 0));

  if (cfgErr) return <ErrorState onRetry={onRetry} />;

  return (
    <div className="max-w-xl space-y-4">
      <Card className="p-4 md:p-5">
        <SectionLabel>Periodo de la raya</SectionLabel>
        <label className="block">
          <span className="mb-1 block text-[11px] text-tx-mut">Largo del periodo (días)</span>
          <Input type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className="w-32" />
        </label>
        <p className="mt-2 text-[11px] text-tx-mut">Define el rango por defecto al calcular (ej. 7 = semanal, 15 = quincenal).</p>

        <SectionLabel>Esquema de pago por defecto</SectionLabel>
        <div className="max-w-md">
          <Segmented options={PAY_TYPES.map((p) => ({ value: p.value, label: p.label }))} value={defaultPayType} onChange={(v) => setDefaultPayType(v)} />
        </div>
        <p className="mt-2 text-[11px] text-tx-mut">Se aplica a empleados nuevos sin tarifa configurada.</p>
      </Card>

      <Card className="p-4 md:p-5">
        <SectionLabel>Descuento de empleado</SectionLabel>
        <label className="flex items-center gap-2">
          <Percent size={14} className="text-tx-mut" />
          <Input type="number" min={0} max={100} step="0.01" value={empDiscount}
            onChange={(e) => setEmpDiscount(e.target.value)} className="w-28 text-right" />
          <span className="text-[11px] text-tx-mut">%</span>
        </label>
        <p className="mt-2 text-[11px] text-tx-mut">
          Descuento por defecto al cobrar “a cuenta de empleado” en el TPV. Se puede sobreescribir por empleado (en Tarifas) o por venta.
        </p>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-tx">Nómina fiscal (CFDI / IMSS)</div>
            <p className="mt-1 text-[11px] text-tx-mut">
              Opcional. Actívala solo si el negocio requiere timbrar recibos de nómina ante el SAT.
              El control interno de la raya funciona sin esto. (Capa fiscal en desarrollo.)
            </p>
          </div>
          <Toggle checked={fiscal} onChange={setFiscal} label="Nómina fiscal" />
        </div>
        {fiscal && (
          <div className="mt-3 flex items-start gap-2 rounded-ds-md p-3" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="text-[11px] font-medium">La emisión de CFDI de nómina aún no está disponible. El flag se guarda para habilitarla cuando esté lista.</span>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button icon={Save}
          onClick={() => onSave({ periodLengthDays: Number(days || 7), defaultPayType, fiscalEnabled: fiscal, employeeDiscountPct: Number(empDiscount || 0) })}>
          Guardar ajustes
        </Button>
      </div>
    </div>
  );
}
