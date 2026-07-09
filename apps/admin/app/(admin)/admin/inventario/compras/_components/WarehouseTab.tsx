"use client";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { DataTable, EmptyState, type Col } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { cellCls, cellStyle, type LocationRow, type WarehouseResp, type WarehouseRow } from "./shared";

export function WarehouseTab({
  locations,
  whLocationId,
  setWhLocationId,
  warehouse,
}: {
  locations: LocationRow[];
  whLocationId: string;
  setWhLocationId: (v: string) => void;
  warehouse: WarehouseResp | null;
}) {
  const columns: Col<WarehouseRow>[] = [
    {
      key: "name", header: "Ingrediente",
      render: (g) => (
        <span className="font-medium text-tx-hi">
          {g.lowStock && <AlertTriangle size={13} className="mr-1 inline text-err" />}{g.name}
        </span>
      ),
    },
    { key: "unit", header: "Unidad", hideBelowMd: true, render: (g) => <span className="text-tx-mut">{g.unit}</span> },
    { key: "stock", header: "Stock", align: "right", render: (g) => <span className="font-bold" style={{ color: g.lowStock ? "var(--err)" : "var(--ok)" }}>{g.stock}</span> },
    { key: "minStock", header: "Mínimo", align: "right", hideBelowMd: true, render: (g) => <span className="text-tx-mut">{g.minStock}</span> },
    { key: "cost", header: "Costo", align: "right", hideBelowMd: true, render: (g) => <span className="text-tx-mut">{formatMoney(g.cost)}</span> },
    { key: "value", header: "Valor", align: "right", render: (g) => <span className="font-display font-extrabold text-primary">{formatMoney(g.value)}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Sucursal</span>
        <select value={whLocationId} onChange={e => setWhLocationId(e.target.value)} className={cellCls} style={cellStyle}>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.name}{l.isCentralWarehouse ? " · Bodega Central" : ""}</option>
          ))}
        </select>
        {warehouse && (
          <span className="ml-auto text-sm font-bold text-tx">
            Valor de inventario:{" "}
            <span className="font-display font-extrabold text-primary">{formatMoney(warehouse.totalValue)}</span>
            <span className="ml-2 text-xs text-tx-mut">({warehouse.count} ingredientes)</span>
          </span>
        )}
      </div>

      {warehouse && warehouse.ingredients.length === 0 ? (
        <EmptyState icon={PackageOpen} title="Bodega vacía" hint="No hay ingredientes con stock en esta sucursal." />
      ) : (
        <DataTable
          columns={columns}
          rows={warehouse?.ingredients || []}
          rowKey={(g) => g.id}
          empty={{ icon: PackageOpen, title: "Bodega vacía", hint: "No hay ingredientes con stock en esta sucursal." }}
        />
      )}
    </div>
  );
}
