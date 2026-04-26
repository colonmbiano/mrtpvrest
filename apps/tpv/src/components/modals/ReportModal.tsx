"use client";
import { useEffect, useState } from "react";
import { Download, Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";

export type SalesReport = {
  from: string;
  to: string;
  totalSales: number;
  totalOrders: number;
  avgTicket: number;
  topProducts: { id: string; name: string; quantity: number; revenue: number }[];
  byMethod: { method: string; total: number }[];
};

export default function ReportModal({
  open,
  onClose,
  fetchReport,
  currency = "$",
}: {
  open: boolean;
  onClose: () => void;
  fetchReport?: (from: string, to: string) => Promise<SalesReport>;
  currency?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setData(null);
    }
  }, [open]);

  const run = async () => {
    if (!fetchReport) return;
    setLoading(true);
    try {
      const r = await fetchReport(from, to);
      setData(r);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["Producto", "Cantidad", "Ingresos"],
      ...data.topProducts.map((p) => [p.name, String(p.quantity), p.revenue.toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Reporte de ventas"
      size="lg"
      footer={
        data ? (
          <button onClick={exportCsv} className="h-10 px-4 rounded-xl text-xs font-bold uppercase hover:brightness-110"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
            <span className="inline-flex items-center gap-2"><Download size={14} /> Exportar CSV</span>
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <Field label="Desde">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} style={INPUT_STYLE} />
          </Field>
          <Field label="Hasta">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT} style={INPUT_STYLE} />
          </Field>
          <button onClick={run} disabled={loading}
            className="h-10 px-4 rounded-xl text-xs font-bold uppercase hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
            {loading ? "Cargando..." : "Generar"}
          </button>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="animate-spin" />
          </div>
        ) : !data ? (
          <div className="py-12 text-center flex flex-col items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <BarChart3 size={36} />
            <p className="text-sm">Selecciona un rango y genera el reporte</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Ventas totales" value={fmt(data.totalSales)} />
              <Stat label="Órdenes"          value={String(data.totalOrders)} />
              <Stat label="Ticket promedio"  value={fmt(data.avgTicket)} />
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                Top productos
              </h3>
              <ul className="flex flex-col gap-1.5">
                {data.topProducts.slice(0, 10).map((p) => (
                  <li key={p.id} className="flex items-center justify-between p-2.5 rounded-lg text-sm"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-primary)" }}>
                      <strong>{p.quantity}×</strong> {p.name}
                    </span>
                    <span className="font-bold" style={{ color: "var(--brand)" }}>{fmt(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                Por método
              </h3>
              <ul className="flex flex-col gap-1.5">
                {data.byMethod.map((m) => (
                  <li key={m.method} className="flex items-center justify-between p-2.5 rounded-lg text-sm"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-primary)" }}>{m.method}</span>
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{fmt(m.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </BaseModal>
  );
}

const INPUT = "px-3 py-2.5 rounded-lg text-sm outline-none";
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl flex flex-col gap-1"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xl font-extrabold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        {value}
      </span>
    </div>
  );
}
