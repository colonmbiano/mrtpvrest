"use client";

import { useEffect, useState } from "react";
import { Save, Banknote, CreditCard, Wifi, Gift, Receipt } from "lucide-react";
import api from "@/lib/api";
import BackButton from "@/components/BackButton";

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

  const methods: Array<{
    key: keyof PaymentConfig;
    label: string;
    sub: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    { key: "acceptCash",     label: "Efectivo",          sub: "Cash drawer + corte ciego",   icon: <Banknote size={18} />,   color: "#88D66C" },
    { key: "acceptCard",     label: "Tarjeta",           sub: "Crédito / débito presencial", icon: <CreditCard size={18} />, color: "#ffb84d" },
    { key: "acceptTransfer", label: "Transferencia",     sub: "SPEI / OXXO / digital",       icon: <Wifi size={18} />,       color: "#22D3EE" },
    { key: "acceptVoucher",  label: "Vales de despensa", sub: "Sodexo, Edenred, Si Vale",   icon: <Receipt size={18} />,    color: "#A78BFA" },
    { key: "acceptCourtesy", label: "Cortesía",          sub: "Comp / on-the-house",         icon: <Gift size={18} />,       color: "#ffb84d" },
  ];

  return (
    <div
      className="relative min-h-full p-6 md:p-8 bg-[#0a0a0c] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-[120px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)' }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-start gap-4">
            <BackButton ariaLabel="Volver al panel admin" />
            <div>
              <p className="text-[10px] font-black tracking-[0.25em] text-white/40">CONFIGURACIÓN</p>
              <h1 className="text-3xl font-black text-white tracking-tight">Pagos e Impuestos</h1>
              <p className="text-sm font-medium text-white/55 mt-1">
                Configura los métodos de pago aceptados, IVA y propina sugerida.
              </p>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black tracking-tight text-[#0a0a0c] bg-[#ffb84d] active:scale-95 transition-transform disabled:opacity-40 shadow-[0_15px_40px_rgba(255,184,77,0.25)]"
          >
            <Save size={16} strokeWidth={3} /> {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

        {msg && (
          <div
            className="mb-5 rounded-2xl p-3 text-xs font-semibold"
            style={{
              background: msg.kind === "ok" ? "rgba(136,214,108,0.12)" : "rgba(255,92,51,0.10)",
              border: `1px solid ${msg.kind === "ok" ? "rgba(136,214,108,0.4)" : "rgba(255,92,51,0.30)"}`,
              color: msg.kind === "ok" ? "#88D66C" : "#FF5C33",
            }}
          >
            {msg.text}
          </div>
        )}

        {/* Tax + Tip */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10">
            <p className="text-[10px] font-black tracking-[0.2em] text-white/40 mb-2">IVA POR DEFECTO (%)</p>
            <input
              type="number"
              min={0}
              max={50}
              step={0.01}
              value={config.taxRate}
              onChange={(e) => setConfig({ ...config, taxRate: Number(e.target.value) })}
              className="w-full bg-transparent text-4xl font-black tabular-nums text-white outline-none"
            />
            <p className="text-[11px] font-medium mt-2 text-white/55">
              México: 16%. Frontera: 8%. Cero rated: 0%.
            </p>
          </div>
          <div className="rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10">
            <p className="text-[10px] font-black tracking-[0.2em] text-white/40 mb-2">PROPINA SUGERIDA (%)</p>
            <input
              type="number"
              min={0}
              max={30}
              step={1}
              value={config.defaultTipPct}
              onChange={(e) => setConfig({ ...config, defaultTipPct: Number(e.target.value) })}
              className="w-full bg-transparent text-4xl font-black tabular-nums text-white outline-none"
            />
            <p className="text-[11px] font-medium mt-2 text-white/55">
              Aparece preseleccionada en el panel de orden.
            </p>
          </div>
        </section>

        {/* Methods */}
        <section className="rounded-3xl overflow-hidden mb-6 bg-white/5 backdrop-blur-md border border-white/10">
          <div className="px-6 py-4 border-b border-white/10">
            <p className="text-[10px] font-black tracking-[0.2em] text-white/40">MÉTODOS DE PAGO</p>
            <p className="text-sm font-black text-white">Habilitar / deshabilitar opciones en el TPV</p>
          </div>
          <div className="divide-y divide-white/5">
            {methods.map((m) => (
              <label
                key={String(m.key)}
                className="flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${m.color}1A`, border: `1px solid ${m.color}33`, color: m.color }}
                >
                  {m.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{m.label}</p>
                  <p className="text-[11px] font-medium text-white/55">{m.sub}</p>
                </div>
                <input
                  type="checkbox"
                  className="scale-125 accent-[#ffb84d]"
                  checked={Boolean((config as any)[m.key])}
                  onChange={(e) => setConfig({ ...config, [m.key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
        </section>

        {/* Receipt setting */}
        <section className="rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10">
          <label className="flex items-center gap-4 cursor-pointer">
            <input
              type="checkbox"
              className="scale-125 accent-[#ffb84d]"
              checked={config.printReceiptDefault}
              onChange={(e) => setConfig({ ...config, printReceiptDefault: e.target.checked })}
            />
            <div>
              <p className="text-sm font-black text-white">Imprimir ticket por defecto</p>
              <p className="text-[11px] font-medium text-white/55">
                Cuando se cobra una orden, el ticket se envía a impresora automáticamente.
              </p>
            </div>
          </label>
        </section>
      </div>
    </div>
  );
}
