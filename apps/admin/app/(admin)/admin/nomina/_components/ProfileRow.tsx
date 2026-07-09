"use client";
import { useState } from "react";
import { Save, Percent } from "lucide-react";
import { Card, Segmented, Input, Button } from "@/components/ds";
import { ROLE_LABEL, RATE_FIELD } from "./shared";

export function ProfileRow({ p, saving, onSave }: { p: any; saving: boolean; onSave: (p: any, patch: any) => void }) {
  const [payType, setPayType] = useState<string>(p.profile?.payType || "DAILY");
  const [rate, setRate] = useState<string>(() => {
    const f = RATE_FIELD[p.profile?.payType || "DAILY"] ?? "dailyRate";
    return p.profile ? String(p.profile[f] ?? 0) : "";
  });
  const field = RATE_FIELD[payType] ?? "dailyRate";
  const initialDisc = p.profile?.discountPct == null ? "" : String(p.profile.discountPct);
  const [disc, setDisc] = useState<string>(initialDisc);
  const dirty =
    payType !== (p.profile?.payType || "DAILY") ||
    String(p.profile?.[field] ?? "") !== String(rate || "") ||
    disc !== initialDisc;

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-[160px] flex-1">
        <div className="text-sm font-semibold text-tx">{p.name}</div>
        <div className="mt-0.5 text-[11px] text-tx-mut">
          {ROLE_LABEL[p.role] || p.role}
          {!p.profile && <span className="ml-1" style={{ color: "var(--warn)" }}>· sin tarifa</span>}
        </div>
      </div>
      <div className="w-40">
        <Segmented
          options={[{ value: "DAILY", label: "Día" }, { value: "HOURLY", label: "Hora" }, { value: "WEEKLY_FIXED", label: "Fijo" }, { value: "PER_DELIVERY", label: "Entrega" }]}
          value={payType}
          onChange={(v) => setPayType(v)}
        />
      </div>
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-tx-mut">$</span>
        <Input
          type="number" min={0} step="0.01" inputMode="decimal"
          value={rate} onChange={(e) => setRate(e.target.value)}
          placeholder="0.00" className="w-28 text-right"
        />
      </label>
      <label className="flex items-center gap-2" title="Descuento de empleado (vacío = usa el default del negocio)">
        <Percent size={13} className="text-tx-mut" />
        <Input
          type="number" min={0} max={100} step="0.01" inputMode="decimal"
          value={disc} onChange={(e) => setDisc(e.target.value)}
          placeholder="auto" className="w-20 text-right"
        />
      </label>
      <Button icon={Save} disabled={saving || !dirty}
        onClick={() => onSave(p, { payType, [field]: Number(rate || 0), discountPct: disc.trim() === "" ? null : Number(disc) })}>
        {saving ? "…" : "Guardar"}
      </Button>
    </Card>
  );
}
