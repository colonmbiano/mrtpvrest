"use client";

import { useEffect, useState } from "react";
import { Save, Banknote, CreditCard, Wifi, Gift, Receipt } from "lucide-react";
import api from "@/lib/api";

interface PaymentConfig {
  taxRate: number;
  defaultTipPct: number;
  acceptCash: boolean;
  acceptCard: boolean;
  acceptTransfer: boolean;
  acceptVoucher: boolean;
  acceptCourtesy: boolean;
  printReceiptDefault: boolean;
}

const DEFAULT_CONFIG: PaymentConfig = {
  taxRate: 16,
  defaultTipPct: 10,
  acceptCash: true,
  acceptCard: true,
  acceptTransfer: true,
  acceptVoucher: false,
  acceptCourtesy: false,
  printReceiptDefault: true,
};

export default function PagosAdmin() {
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/admin/config");
        setConfig({
          taxRate: data?.taxRate ?? 16,
          defaultTipPct: data?.defaultTipPct ?? 10,
          acceptCash: data?.acceptCash ?? true,
          acceptCard: data?.acceptCard ?? true,
          acceptTransfer: data?.acceptTransfer ?? true,
          acceptVoucher: data?.acceptVoucher ?? false,
          acceptCourtesy: data?.acceptCourtesy ?? false,
          printReceiptDefault: data?.printReceiptDefault ?? true,
        });
      } catch (e: any) {
        setMsg({ kind: "err", text: e?.response?.data?.error || "No pudimos cargar la configuración" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.put("/api/admin/config", config);
      setMsg({ kind: "ok", text: "Configuración actualizada" });
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  };

  const methods: Array<{ key: keyof PaymentConfig; label: string; sub: string; icon: React.ReactNode; color: string }> = [
    { key: "acceptCash",     label: "Efectivo",       sub: "Cash drawer + corte ciego",   icon: <Banknote size={16} />, color: "#88D66C" },
    { key: "acceptCard",     label: "Tarjeta",        sub: "Crédito / débito presencial", icon: <CreditCard size={16} />, color: "#FF8400" },
    { key: "acceptTransfer", label: "Transferencia",  sub: "SPEI / OXXO / digital",       icon: <Wifi size={16} />, color: "#22D3EE" },
    { key: "acceptVoucher",  label: "Vales de despensa", sub: "Sodexo, Edenred, Si Vale", icon: <Receipt size={16} />, color: "#A78BFA" },
    { key: "acceptCourtesy", label: "Cortesía",       sub: "Comp / on-the-house",         icon: <Gift size={16} />, color: "#FFB84D" },
  ];

  return (
    <div className="min-h-full p-8" style={{ background: "#0C0C0E", color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>ADMINISTRACIÓN</p>
          <h1 className="text-2xl font-bold">Pagos e Impuestos</h1>
          <p className="text-xs mt-1" style={{ color: "#B8B9B6" }}>
            Configura los métodos de pago aceptados, IVA y propina sugerida.
          </p>
        </div>
        <button onClick={save} disabled={saving || loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-black disabled:opacity-50"
          style={{ background: "#FF8400", boxShadow: "0 6px 14px rgba(255,132,0,0.3)" }}>
          <Save size={15} /> {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      {msg && (
        <div className="mb-4 rounded-xl p-3 text-xs"
          style={{
            background: msg.kind === "ok" ? "rgba(136,214,108,0.12)" : "#FF5C3315",
            border: `1px solid ${msg.kind === "ok" ? "rgba(136,214,108,0.4)" : "#FF5C3340"}`,
            color: msg.kind === "ok" ? "#88D66C" : "#FF5C33",
          }}>
          {msg.text}
        </div>
      )}

      {/* Tax + Tip */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
          <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "#666" }}>IVA POR DEFECTO (%)</p>
          <input type="number" min={0} max={50} step={0.01} value={config.taxRate}
            onChange={(e) => setConfig({ ...config, taxRate: Number(e.target.value) })}
            className="w-full bg-transparent text-3xl font-bold tabular-nums outline-none" />
          <p className="text-[10px] mt-2" style={{ color: "#B8B9B6" }}>
            México: 16%. Frontera: 8%. Cero rated: 0%.
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
          <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "#666" }}>PROPINA SUGERIDA (%)</p>
          <input type="number" min={0} max={30} step={1} value={config.defaultTipPct}
            onChange={(e) => setConfig({ ...config, defaultTipPct: Number(e.target.value) })}
            className="w-full bg-transparent text-3xl font-bold tabular-nums outline-none" />
          <p className="text-[10px] mt-2" style={{ color: "#B8B9B6" }}>
            Aparece preseleccionada en el panel de orden.
          </p>
        </div>
      </section>

      {/* Methods */}
      <section className="rounded-2xl overflow-hidden mb-6" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid #27272A" }}>
          <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>MÉTODOS DE PAGO</p>
          <p className="text-sm font-bold">Habilitar / deshabilitar opciones en el TPV</p>
        </div>
        <div className="divide-y divide-[#1F1F23]">
          {methods.map(m => (
            <label key={String(m.key)}
              className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/5 transition">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: `${m.color}20`, color: m.color }}>
                {m.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">{m.label}</p>
                <p className="text-[10px]" style={{ color: "#B8B9B6" }}>{m.sub}</p>
              </div>
              <input type="checkbox" className="scale-125 accent-orange-500"
                checked={Boolean((config as any)[m.key])}
                onChange={(e) => setConfig({ ...config, [m.key]: e.target.checked })} />
            </label>
          ))}
        </div>
      </section>

      {/* Receipt setting */}
      <section className="rounded-2xl p-5" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="scale-125 accent-orange-500"
            checked={config.printReceiptDefault}
            onChange={(e) => setConfig({ ...config, printReceiptDefault: e.target.checked })} />
          <div>
            <p className="text-sm font-bold">Imprimir ticket por defecto</p>
            <p className="text-[10px]" style={{ color: "#B8B9B6" }}>
              Cuando se cobra una orden, el ticket se envía a impresora automáticamente.
            </p>
          </div>
        </label>
      </section>
    </div>
  );
}
