"use client";
import { AlertTriangle, RotateCw, Truck } from "lucide-react";
import { Card, Button, EmptyState, DataTable, type Col } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import {
  cellCls, cellStyle, inputStyle,
  type LocationRow, type SuggestionRow, type TransferRow,
} from "./shared";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

export function RepartoTab({
  centralLoc,
  branches,
  repartoDest,
  onLoadSuggestion,
  suggestion,
  repartoQty,
  setRepartoQty,
  repartoNotes,
  setRepartoNotes,
  repartoTotal,
  savingReparto,
  onSubmit,
  transfers,
}: {
  centralLoc: LocationRow | null;
  branches: LocationRow[];
  repartoDest: string;
  onLoadSuggestion: (toLocationId: string) => void;
  suggestion: SuggestionRow[];
  repartoQty: Record<string, string>;
  setRepartoQty: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  repartoNotes: string;
  setRepartoNotes: (v: string) => void;
  repartoTotal: number;
  savingReparto: boolean;
  onSubmit: () => void;
  transfers: TransferRow[];
}) {
  const suggestionCols: Col<SuggestionRow>[] = [
    { key: "name", header: "Ingrediente", render: (s) => <span className="font-medium text-tx-hi">{s.name}</span> },
    { key: "destStock", header: "En sucursal", align: "right", hideBelowMd: true, render: (s) => <span className="text-tx-mut">{s.destStock} {s.unit}</span> },
    { key: "destMinStock", header: "Mínimo", align: "right", hideBelowMd: true, render: (s) => <span className="text-tx-mut">{s.destMinStock}</span> },
    { key: "centralStock", header: "En central", align: "right", hideBelowMd: true, render: (s) => <span className="text-tx-mut">{s.centralStock}</span> },
    {
      key: "repartir", header: "Repartir", align: "right",
      render: (s) => (
        <input type="number" step="0.001" min="0" max={s.centralStock}
          value={repartoQty[s.centralIngredientId] ?? ""}
          onChange={e => setRepartoQty(p => ({ ...p, [s.centralIngredientId]: e.target.value }))}
          className={`${cellCls} w-28 tabular-nums`} style={cellStyle} />
      ),
    },
  ];

  const transferCols: Col<TransferRow>[] = [
    { key: "date", header: "Fecha", mono: true, hideBelowMd: true, render: (t) => <span className="text-tx-mut">{fmtDateTime(t.createdAt)}</span> },
    { key: "from", header: "Desde", render: (t) => <span className="text-tx-hi">{t.fromLocation?.name || "—"}</span> },
    { key: "items", header: "Renglones", align: "right", hideBelowMd: true, render: (t) => <span className="text-tx-mut">{t.items?.length ?? 0}</span> },
    { key: "cost", header: "Costo", align: "right", render: (t) => <span className="font-display font-extrabold text-primary">{formatMoney(t.totalCost)}</span> },
    { key: "by", header: "Por", hideBelowMd: true, render: (t) => <span className="text-tx-mut">{t.createdBy?.name || "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      {!centralLoc && (
        <Card className="p-4 text-sm text-err">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} /> Asigna primero la Bodega Central en la configuración de arriba.
          </span>
        </Card>
      )}
      <Card className="p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Repartir a</span>
          <select value={repartoDest} onChange={e => onLoadSuggestion(e.target.value)} className={cellCls} style={cellStyle}>
            <option value="">— sucursal destino —</option>
            {branches.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {repartoDest && (
            <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => onLoadSuggestion(repartoDest)}>
              Recalcular
            </Button>
          )}
        </div>

        {repartoDest && suggestion.length === 0 && (
          <p className="py-6 text-center text-sm text-tx-mut">
            Sin sugerencias: ninguna sucursal está bajo mínimo o la Bodega Central no tiene stock.
          </p>
        )}

        {suggestion.length > 0 && (
          <>
            <DataTable columns={suggestionCols} rows={suggestion} rowKey={(s) => s.centralIngredientId} />

            <textarea value={repartoNotes} onChange={e => setRepartoNotes(e.target.value)}
              placeholder="Notas del reparto (opcional)" rows={2}
              className="mt-4 w-full resize-none rounded-ds-md px-3 py-2.5 text-sm text-tx outline-none focus:border-primary"
              style={inputStyle} />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
              <p className="text-sm font-bold text-tx">
                Costo estimado: <span className="font-display font-extrabold text-primary">{formatMoney(repartoTotal)}</span>
              </p>
              <Button onClick={onSubmit} loading={savingReparto}>Confirmar reparto</Button>
            </div>
          </>
        )}
      </Card>

      <div>
        <h3 className="mb-3 font-display text-base font-extrabold text-tx-hi md:text-xl">Repartos recientes</h3>
        {transfers.length === 0 ? (
          <EmptyState icon={Truck} title="Sin repartos" hint="Los repartos a sucursales aparecerán aquí." />
        ) : (
          <DataTable columns={transferCols} rows={transfers} rowKey={(t) => t.id} />
        )}
      </div>
    </div>
  );
}
