"use client";
import { BookOpen } from "lucide-react";
import { DataTable, type Col } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import type { PurchaseOrder } from "./shared";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });

export function HistoryTab({ history }: { history: PurchaseOrder[] }) {
  const columns: Col<PurchaseOrder>[] = [
    { key: "poNumber", header: "Folio", render: (po) => <span className="font-bold text-tx-hi">{po.poNumber}</span> },
    { key: "date", header: "Fecha", mono: true, hideBelowMd: true, render: (po) => <span className="text-tx-mut">{fmtDate(po.receivedAt || po.createdAt)}</span> },
    { key: "supplier", header: "Proveedor", render: (po) => <span className="text-tx-mut">{po.supplier?.name || "—"}</span> },
    { key: "location", header: "Destino", hideBelowMd: true, render: (po) => <span className="text-tx-mut">{po.location?.name || "—"}</span> },
    { key: "payment", header: "Pago", hideBelowMd: true, render: (po) => <span className="text-xs text-tx-mut">{po.paymentMethod}</span> },
    { key: "items", header: "Renglones", align: "right", hideBelowMd: true, render: (po) => <span className="text-tx-mut">{po.items?.length ?? 0}</span> },
    { key: "total", header: "Total", align: "right", render: (po) => <span className="font-display font-extrabold text-primary">{formatMoney(po.totalAmount)}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={history}
      rowKey={(po) => po.id}
      empty={{ icon: BookOpen, title: "Sin compras registradas", hint: "Las órdenes de compra aparecerán aquí." }}
    />
  );
}
